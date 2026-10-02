<?php
/**
 * CCRM release notes — Craft CMS module.
 *
 * Lets the automated release-notes pipeline (docs/RELEASE-NOTES.md in the CCRM
 * repository) upload screenshots and create or update `updateNotes` entries.
 *
 * Copy this directory to `modules/ccrmnews/` in your Craft project and register
 * it in `config/app.php` next to the licence module:
 *
 *     return [
 *         'modules'   => [
 *             'ccrm-license' => \modules\ccrmlicense\CcrmLicense::class,
 *             'ccrm-news'    => \modules\ccrmnews\CcrmNews::class,
 *         ],
 *         'bootstrap' => ['ccrm-license', 'ccrm-news'],
 *     ];
 *
 * and set in Craft's `.env`:
 *
 *     CCRM_NEWS_API_TOKEN="<at least 32 random characters, same as CRAFT_NEWS_TOKEN on the publishing PC>"
 *     CCRM_NEWS_VOLUME="images"          # asset volume handle for screenshots (optional, default "images")
 *     CCRM_NEWS_AUTHOR_ID="1"            # user id the entries are authored by (optional, default: first admin)
 *
 * Requires Craft 5 (Matrix fields that hold entries). Written against the
 * Craft 5 API but not yet run against the live install — publish the first
 * article in draft mode (RELEASE_NOTES_PUBLISH=draft) and check it in the CP.
 */

namespace modules\ccrmnews;

use Craft;
use craft\events\RegisterUrlRulesEvent;
use craft\web\UrlManager;
use yii\base\Event;
use yii\base\Module;

class CcrmNews extends Module
{
    public function __construct($id, $parent = null, array $config = [])
    {
        Craft::setAlias('@modules/ccrmnews', __DIR__);
        $this->controllerNamespace = 'modules\\ccrmnews\\controllers';

        parent::__construct($id, $parent, $config);
    }

    public function init(): void
    {
        parent::init();

        // Site routes, not CP ones: the caller is a script with a token, not a
        // signed-in Craft user.
        Event::on(
            UrlManager::class,
            UrlManager::EVENT_REGISTER_SITE_URL_RULES,
            static function (RegisterUrlRulesEvent $event): void {
                $event->rules['ccrm-news/ping'] = 'ccrm-news/api/ping';
                $event->rules['ccrm-news/asset'] = 'ccrm-news/api/asset';
                $event->rules['ccrm-news/publish'] = 'ccrm-news/api/publish';
            }
        );
    }
}
