<?php
/**
 * The three endpoints the release-notes publisher calls. All require
 *   Authorization: Bearer <CCRM_NEWS_API_TOKEN>
 * or the same value in X-CCRM-News-Token. The publisher uses the latter: it
 * survives Apache/FastCGI setups that strip Authorization, and it does not
 * collide with Craft's GraphQL, which reads any Bearer token as its own.
 *
 * GET  /ccrm-news/ping     Is Craft set up? Lists missing block types and fields,
 *                          and which fields are translatable per site.
 * POST /ccrm-news/asset    multipart: file, filename, title, version
 *                          → { success, assetId, url }. Re-uploading the same
 *                          filename for the same version replaces the file.
 * POST /ccrm-news/publish  JSON: { version, releaseType, sourceCommit, enabled, postDate,
 *                                  sites: { <siteHandle>: { title, blocks: [ { type, fields } ] } } }
 *                          → { success, entryId, created, cpEditUrl, skippedSites }.
 *                          Idempotent per version: a second call replaces the
 *                          entry's content instead of creating a duplicate.
 * GET  /ccrm-news/state    → { success, state } — the pipeline's memory between runs
 * POST /ccrm-news/state    JSON body replaces it. A cloud routine keeps no disk,
 *                          so "last handled release" lives here, in
 *                          storage/ccrm-news/state.json.
 *
 * Multi-site: every site gets the same block structure. The primary site is
 * saved first; the other sites then receive only the values Craft actually
 * keeps per site (translatable fields, per-site relations). A field that is
 * not translatable is shared, so writing the English text into it would
 * overwrite the Slovak one — those values are skipped and reported back.
 */

namespace modules\ccrmnews\controllers;

use Craft;
use craft\base\Element;
use craft\base\FieldInterface;
use craft\elements\Asset;
use craft\elements\Entry;
use craft\elements\User;
use craft\fields\BaseRelationField;
use craft\fields\Matrix;
use craft\helpers\App;
use craft\helpers\Assets as AssetsHelper;
use craft\models\EntryType;
use craft\models\Section;
use craft\web\Controller;
use craft\web\UploadedFile;
use yii\web\Response;

class ApiController extends Controller
{
    protected array|bool|int $allowAnonymous = true;

    /** A token-authenticated JSON API has no Craft session to carry a CSRF token. */
    public $enableCsrfValidation = false;

    private const SECTION = 'updateNotes';
    private const ENTRY_TYPE = 'news';
    private const MATRIX = 'contentMatrix';
    private const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

    /** Matrix entry type handle => the field handles it carries (and the only ones accepted). */
    private const BLOCK_FIELDS = [
        'textblock' => ['text'],
        'image' => ['image'],
        'imageWithText' => ['image', 'text', 'imageDirection'],
        'gallery' => ['images', 'galleryColumns'],
        'heading' => ['headingText', 'headingLevel', 'moduleTag'],
        'callout' => ['calloutType', 'text'],
        'changeList' => ['listType', 'headingText', 'listItems'],
    ];

    /**
     * Handles that may live in the block's own Title instead of a field — an
     * entry type with "Use a title field" on and no field of that handle.
     */
    private const TITLE_HANDLES = ['headingText'];

    /** Without these a block is useless; the other handles are optional. */
    private const REQUIRED_FIELDS = [
        'textblock' => ['text'],
        'image' => ['image'],
        'imageWithText' => ['image', 'text'],
        'gallery' => ['images'],
        'heading' => ['headingText', 'headingLevel'],
        'callout' => ['text'],
        'changeList' => ['listItems'],
    ];

    /** Set on the article entry when its layout has them; never required. */
    private const OPTIONAL_ENTRY_FIELDS = ['releaseType', 'sourceCommit'];

    public function beforeAction($action): bool
    {
        if (!parent::beforeAction($action)) {
            return false;
        }

        $expected = (string) (App::env('CCRM_NEWS_API_TOKEN') ?? '');
        $headers = Craft::$app->getRequest()->getHeaders();
        $given = '';
        if (preg_match('/^Bearer\s+(\S+)$/i', (string) $headers->get('Authorization', ''), $m)) {
            $given = $m[1];
        }
        if ($given === '') {
            $given = trim((string) $headers->get('X-CCRM-News-Token', ''));
        }

        // An unset or short server token refuses everything rather than accepting an empty one.
        if (strlen($expected) < 32 || $given === '' || !hash_equals($expected, $given)) {
            $this->fail('unauthorized', 401);
            return false;
        }
        return true;
    }

    /* ------------------------------------------------------------------ ping */

    public function actionPing(): Response
    {
        $missing = [];
        $optional = [];
        $translatable = [];

        $section = $this->section();
        $entryType = $section ? $this->entryType($section) : null;
        $matrix = $entryType?->getFieldLayout()->getFieldByHandle(self::MATRIX);

        if (!$section) {
            $missing[] = 'section:' . self::SECTION;
        } elseif (!$entryType) {
            $missing[] = 'entryType:' . self::ENTRY_TYPE;
        } elseif (!$matrix instanceof Matrix) {
            $missing[] = 'field:' . self::MATRIX;
        } else {
            $translatable['title'] = $entryType->titleTranslationMethod !== 'none';
            if (!$entryType->getFieldLayout()->getFieldByHandle('version')) {
                $missing[] = 'field:news.version';
            }
            $blockTypes = $this->blockTypes($matrix);
            foreach (self::BLOCK_FIELDS as $handle => $fields) {
                $type = $blockTypes[$handle] ?? null;
                if (!$type) {
                    $missing[] = "blockType:$handle";
                    continue;
                }
                foreach ($fields as $fieldHandle) {
                    $field = $type->getFieldLayout()->getFieldByHandle($fieldHandle);
                    if ($field) {
                        $translatable[$fieldHandle] = ($translatable[$fieldHandle] ?? true) && $this->isPerSite($field);
                    } elseif (in_array($fieldHandle, self::TITLE_HANDLES, true) && $type->hasTitleField) {
                        $translatable[$fieldHandle] = ($translatable[$fieldHandle] ?? true) && $type->titleTranslationMethod !== 'none';
                    } elseif (in_array($fieldHandle, self::REQUIRED_FIELDS[$handle], true)) {
                        $missing[] = "field:$handle.$fieldHandle";
                    } else {
                        $optional[] = "field:$handle.$fieldHandle";
                    }
                }
            }
        }

        $volume = $this->volume();
        if (!$volume) {
            $missing[] = 'volume:' . $this->volumeHandle();
        }

        return $this->asJson([
            'success' => true,
            'craftVersion' => Craft::$app->getVersion(),
            'primarySite' => Craft::$app->getSites()->getPrimarySite()->handle,
            'sites' => array_map(static fn($s) => $s->handle, Craft::$app->getSites()->getAllSites()),
            'volume' => $volume?->handle,
            'translatable' => $translatable,
            'missing' => $missing,
            'optionalNotInLayout' => $optional,
        ]);
    }

    /* ----------------------------------------------------------------- asset */

    public function actionAsset(): Response
    {
        $this->requirePostRequest();
        $request = Craft::$app->getRequest();

        $version = (string) $request->getBodyParam('version', '');
        $filename = AssetsHelper::prepareAssetName((string) $request->getBodyParam('filename', ''));
        $title = trim((string) $request->getBodyParam('title', ''));
        $upload = UploadedFile::getInstanceByName('file');

        if (!$this->validVersion($version)) {
            return $this->fail('bad_version', 400);
        }
        if (!$upload || $upload->getHasError()) {
            return $this->fail('no_file', 400);
        }
        if ($upload->size > self::MAX_UPLOAD_BYTES) {
            return $this->fail('file_too_large', 413);
        }
        if (!preg_match('/\.(png|jpe?g|webp)$/i', $filename)) {
            return $this->fail('bad_filename', 400, ['expected' => '*.png, *.jpg or *.webp']);
        }
        if (@getimagesize($upload->tempName) === false) {
            return $this->fail('not_an_image', 400);
        }

        $volume = $this->volume();
        if (!$volume) {
            return $this->fail('volume_missing', 500, ['volume' => $this->volumeHandle()]);
        }

        $assets = Craft::$app->getAssets();
        $folder = $assets->ensureFolderByFullPathAndVolume('release-notes/' . str_replace('.', '-', $version), $volume, false);
        $tempPath = $upload->saveAsTempFile();
        if ($tempPath === false) {
            return $this->fail('upload_failed', 500);
        }

        $asset = Asset::find()->folderId($folder->id)->filename($filename)->one();
        if ($asset) {
            // A re-run of the same release: replace the picture, keep the asset id.
            $assets->replaceAssetFile($asset, $tempPath, $filename);
        } else {
            $asset = new Asset();
            $asset->tempFilePath = $tempPath;
            $asset->setFilename($filename);
            $asset->newFolderId = $folder->id;
            $asset->setVolumeId($volume->id);
            $asset->avoidFilenameConflicts = false;
            $asset->setScenario(Asset::SCENARIO_CREATE);
        }
        if ($title !== '') {
            $asset->title = mb_substr($title, 0, 255);
        }
        if (!Craft::$app->getElements()->saveElement($asset)) {
            return $this->fail('asset_not_saved', 422, $asset->getErrors());
        }

        return $this->asJson(['success' => true, 'assetId' => $asset->id, 'url' => $asset->getUrl()]);
    }

    /* --------------------------------------------------------------- publish */

    public function actionPublish(): Response
    {
        $this->requirePostRequest();

        $body = json_decode((string) Craft::$app->getRequest()->getRawBody(), true);
        if (!is_array($body)) {
            return $this->fail('bad_json', 400);
        }

        $version = (string) ($body['version'] ?? '');
        $releaseType = (string) ($body['releaseType'] ?? '');
        $sites = $body['sites'] ?? null;
        if (!$this->validVersion($version)) {
            return $this->fail('bad_version', 400);
        }
        if (!in_array($releaseType, ['major', 'patch'], true)) {
            return $this->fail('bad_release_type', 400);
        }

        $primarySite = Craft::$app->getSites()->getPrimarySite();
        if (!is_array($sites) || !is_array($sites[$primarySite->handle] ?? null)) {
            return $this->fail('primary_site_missing', 400, ['primarySite' => $primarySite->handle]);
        }

        $section = $this->section();
        $entryType = $section ? $this->entryType($section) : null;
        $matrix = $entryType?->getFieldLayout()->getFieldByHandle(self::MATRIX);
        if (!$matrix instanceof Matrix) {
            return $this->fail('not_configured', 500, ['run' => 'GET /ccrm-news/ping']);
        }
        $blockTypes = $this->blockTypes($matrix);

        // Every site must describe the same structure: same block types in the same order.
        $primaryBlocks = $sites[$primarySite->handle]['blocks'] ?? [];
        $shape = $this->blockShape($primaryBlocks, $blockTypes, $error);
        if ($shape === null) {
            return $this->fail('bad_blocks', 422, ['site' => $primarySite->handle, 'problem' => $error]);
        }
        foreach ($sites as $handle => $site) {
            if ($this->blockShape($site['blocks'] ?? [], $blockTypes, $error) !== $shape) {
                return $this->fail('sites_differ', 422, ['site' => $handle, 'problem' => $error ?: 'block types or order differ from the primary site']);
            }
        }

        $transaction = Craft::$app->getDb()->beginTransaction();
        try {
            $entry = $this->findByVersion($section, $version, $primarySite->id);
            $created = $entry === null;
            if ($created) {
                $entry = new Entry();
                $entry->sectionId = $section->id;
                $entry->typeId = $entryType->id;
                $entry->siteId = $primarySite->id;
                $authorId = (int) (App::env('CCRM_NEWS_AUTHOR_ID') ?: (User::find()->admin()->status(null)->one()?->id ?? 0));
                if ($authorId) {
                    method_exists($entry, 'setAuthorIds') ? $entry->setAuthorIds([$authorId]) : $entry->authorId = $authorId;
                }
                $entry->postDate = new \DateTime((string) ($body['postDate'] ?? 'now'));
            }

            $entry->enabled = (bool) ($body['enabled'] ?? true);
            $entry->setEnabledForSite(true);
            $entry->title = $this->cleanTitle($sites[$primarySite->handle]['title'] ?? '', $version);
            $entry->slug = 'verzia-' . str_replace('.', '-', $version);
            $entry->setFieldValue('version', $version);
            $layout = $entryType->getFieldLayout();
            if ($layout->getFieldByHandle('releaseType')) {
                $entry->setFieldValue('releaseType', $releaseType);
            }
            if ($layout->getFieldByHandle('sourceCommit')) {
                $entry->setFieldValue('sourceCommit', substr((string) ($body['sourceCommit'] ?? ''), 0, 64));
            }
            $entry->setFieldValue(self::MATRIX, $this->newMatrixValue($primaryBlocks, $blockTypes));
            if ($entry->enabled) {
                $entry->setScenario(Element::SCENARIO_LIVE);
            }

            if (!Craft::$app->getElements()->saveElement($entry)) {
                $transaction->rollBack();
                return $this->fail('entry_not_saved', 422, $entry->getErrors());
            }

            $skipped = [];
            $titlePerSite = $entryType->titleTranslationMethod !== 'none';
            foreach ($sites as $handle => $siteData) {
                if ($handle === $primarySite->handle) {
                    continue;
                }
                $site = Craft::$app->getSites()->getSiteByHandle($handle);
                $localized = $site
                    ? Entry::find()->id($entry->id)->siteId($site->id)->status(null)->one()
                    : null;
                if (!$localized) {
                    $skipped[] = "$handle: entry is not enabled for this site in the section settings";
                    continue;
                }

                if ($titlePerSite) {
                    $localized->title = $this->cleanTitle($siteData['title'] ?? '', $version);
                } else {
                    $skipped[] = "$handle: title";
                }

                // Shared nested entries (propagation "all sites") keep their ids across
                // sites; per-site propagation gives each site its own. Use whatever this
                // site has if it matches, otherwise build the site's blocks from scratch.
                $existing = $localized->getFieldValue(self::MATRIX)->status(null)->all();
                $sameShape = count($existing) === count($shape)
                    && array_map(static fn($e) => $e->getType()->handle, $existing) === $shape;

                if ($sameShape) {
                    $value = ['sortOrder' => [], 'entries' => []];
                    $skippedFields = [];
                    foreach ($existing as $i => $nested) {
                        $value['sortOrder'][] = $nested->id;
                        $value['entries'][$nested->id] = $this->blockData(
                            $blockTypes[$shape[$i]],
                            $shape[$i],
                            $siteData['blocks'][$i]['fields'] ?? [],
                            true,
                            $skippedFields,
                        );
                    }
                    if ($skippedFields) {
                        $skipped[] = "$handle: " . implode(', ', array_keys($skippedFields)) . ' (not translatable — shared with the primary site)';
                    }
                } else {
                    $value = $this->newMatrixValue($siteData['blocks'], $blockTypes);
                }
                $localized->setFieldValue(self::MATRIX, $value);

                if (!Craft::$app->getElements()->saveElement($localized)) {
                    $transaction->rollBack();
                    return $this->fail('site_not_saved', 422, ['site' => $handle, 'errors' => $localized->getErrors()]);
                }
            }

            $transaction->commit();
        } catch (\Throwable $e) {
            $transaction->rollBack();
            Craft::error('ccrm-news publish failed: ' . $e->getMessage(), __METHOD__);
            return $this->fail('exception', 500, ['message' => $e->getMessage()]);
        }

        return $this->asJson([
            'success' => true,
            'entryId' => $entry->id,
            'created' => $created,
            'enabled' => $entry->enabled,
            'cpEditUrl' => $entry->getCpEditUrl(),
            'skippedSites' => array_values(array_unique($skipped)),
        ]);
    }

    /* ----------------------------------------------------------------- state */

    public function actionState(): Response
    {
        try {
            return $this->stateResponse();
        } catch (Throwable $e) {
            Craft::error('ccrm-news state failed: ' . $e->getMessage(), __METHOD__);
            return $this->fail('exception', 500, ['message' => $e->getMessage(), 'at' => basename($e->getFile()) . ':' . $e->getLine()]);
        }
    }

    private function stateResponse(): Response
    {
        $file = Craft::$app->getPath()->getStoragePath() . '/ccrm-news/state.json';
        $request = Craft::$app->getRequest();

        if ($request->getIsPost()) {
            $raw = (string) $request->getRawBody();
            if (strlen($raw) > 256 * 1024) {
                return $this->fail('state_too_large', 413);
            }
            $state = json_decode($raw, true);
            if (!is_array($state)) {
                return $this->fail('bad_json', 400);
            }
            FileHelper::writeToFile($file, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            return $this->asJson(['success' => true]);
        }

        $state = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        return $this->asJson(['success' => true, 'state' => is_array($state) ? $state : null]);
    }

    /* --------------------------------------------------------------- helpers */

    private function section(): ?Section
    {
        return Craft::$app->getEntries()->getSectionByHandle(self::SECTION);
    }

    private function entryType(Section $section): ?EntryType
    {
        foreach ($section->getEntryTypes() as $type) {
            if ($type->handle === self::ENTRY_TYPE) {
                return $type;
            }
        }
        return null;
    }

    /** @return array<string, EntryType> */
    private function blockTypes(Matrix $matrix): array
    {
        $types = [];
        foreach ($matrix->getEntryTypes() as $type) {
            $types[$type->handle] = $type;
        }
        return $types;
    }

    private function volumeHandle(): string
    {
        return (string) (App::env('CCRM_NEWS_VOLUME') ?: 'images');
    }

    private function volume()
    {
        return Craft::$app->getVolumes()->getVolumeByHandle($this->volumeHandle());
    }

    private function validVersion(string $version): bool
    {
        return (bool) preg_match('/^\d+\.\d+(\.\d+)?$/', $version);
    }

    /** Does this field keep a separate value per site? */
    private function isPerSite(FieldInterface $field): bool
    {
        // Current Craft 5 gives relation fields a translation method too; older
        // releases only had the "Manage relations on a per-site basis" switch.
        if (($field->translationMethod ?? 'none') !== 'none') {
            return true;
        }
        return $field instanceof BaseRelationField && property_exists($field, 'localizeRelations') && $field->localizeRelations;
    }

    private function cleanTitle(mixed $title, string $version): string
    {
        $title = trim(strip_tags((string) $title));
        return $title !== '' ? mb_substr($title, 0, 255) : "Verzia $version";
    }

    private function findByVersion(Section $section, string $version, int $siteId): ?Entry
    {
        // A handful of entries a year: compare in PHP rather than rely on how a
        // custom-field query param behaves on this Craft version.
        foreach (Entry::find()->sectionId($section->id)->siteId($siteId)->status(null)->all() as $entry) {
            if ((string) $entry->getFieldValue('version') === $version) {
                return $entry;
            }
        }
        return null;
    }

    /**
     * The block type handles in order, or null (with $error set) if a block is unusable.
     * @return string[]|null
     */
    private function blockShape(mixed $blocks, array $blockTypes, ?string &$error = null): ?array
    {
        $error = null;
        if (!is_array($blocks) || !$blocks) {
            $error = 'no blocks';
            return null;
        }
        $shape = [];
        foreach (array_values($blocks) as $i => $block) {
            $type = (string) ($block['type'] ?? '');
            if (!isset(self::BLOCK_FIELDS[$type])) {
                $error = "block $i: unknown type \"$type\"";
                return null;
            }
            if (!isset($blockTypes[$type])) {
                $error = "block $i: the contentMatrix field has no \"$type\" entry type";
                return null;
            }
            $shape[] = $type;
        }
        return $shape;
    }

    private function newMatrixValue(array $blocks, array $blockTypes): array
    {
        $value = ['sortOrder' => [], 'entries' => []];
        $unused = [];
        foreach (array_values($blocks) as $i => $block) {
            $key = 'new' . ($i + 1);
            $value['sortOrder'][] = $key;
            $value['entries'][$key] = $this->blockData($blockTypes[$block['type']], $block['type'], $block['fields'] ?? [], false, $unused);
        }
        return $value;
    }

    /**
     * One nested entry's serialized data. A handle the layout has goes into
     * `fields`; a TITLE_HANDLES handle the layout lacks goes into the entry's
     * own title. With $perSiteOnly, values Craft shares between sites are left
     * out (and named in $skipped) so a translation never overwrites the original.
     */
    private function blockData(EntryType $type, string $blockHandle, array $incoming, bool $perSiteOnly, array &$skipped): array
    {
        $data = ['type' => $blockHandle, 'enabled' => true, 'fields' => []];
        foreach ($incoming as $fieldHandle => $raw) {
            if (!in_array($fieldHandle, self::BLOCK_FIELDS[$blockHandle], true)) {
                continue;
            }
            $field = $type->getFieldLayout()->getFieldByHandle($fieldHandle);
            if ($field) {
                if ($perSiteOnly && !$this->isPerSite($field)) {
                    $skipped[$fieldHandle] = true;
                    continue;
                }
                $data['fields'][$fieldHandle] = $this->fieldValue($fieldHandle, $raw);
            } elseif (in_array($fieldHandle, self::TITLE_HANDLES, true) && $type->hasTitleField) {
                if ($perSiteOnly && $type->titleTranslationMethod === 'none') {
                    $skipped["$blockHandle title"] = true;
                    continue;
                }
                $data['title'] = $this->fieldValue($fieldHandle, $raw);
            }
        }
        return $data;
    }

    /** Coerces one incoming value to what the field type expects. */
    private function fieldValue(string $handle, mixed $raw): mixed
    {
        return match ($handle) {
            'image', 'images' => array_values(array_filter(array_map('intval', (array) $raw))),
            'imageDirection' => (bool) $raw,
            'headingLevel' => in_array($raw, ['h2', 'h3'], true) ? $raw : 'h2',
            'galleryColumns' => in_array((string) $raw, ['2', '3'], true) ? (string) $raw : '2',
            'calloutType' => in_array($raw, ['where', 'tip', 'info', 'warning'], true) ? $raw : 'info',
            'listType' => in_array($raw, ['fixes', 'improvements'], true) ? $raw : 'fixes',
            'headingText', 'moduleTag' => mb_substr(trim(strip_tags((string) $raw)), 0, 255),
            'listItems' => trim(strip_tags((string) $raw)),
            default => (string) $raw, // CKEditor HTML — the publisher only sends a small tag whitelist
        };
    }

    private function fail(string $error, int $status, array $details = []): Response
    {
        $response = $this->asJson(['success' => false, 'error' => $error] + ($details ? ['details' => $details] : []));
        $response->setStatusCode($status);
        return $response;
    }
}
