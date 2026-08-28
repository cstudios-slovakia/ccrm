<?php
/**
 * CCRM licence server — Craft CMS module.
 *
 * Copy this directory to `modules/ccrmlicense/` in your Craft project and
 * register it in `config/app.php`:
 *
 *     return [
 *         'modules'   => ['ccrm-license' => \modules\ccrmlicense\CcrmLicense::class],
 *         'bootstrap' => ['ccrm-license'],
 *     ];
 *
 * The private signing key is read from the path in the CCRM_LICENSE_PRIVATE_KEY_PATH
 * environment variable and must live OUTSIDE the web root.
 *
 * NOTE: written against Craft 4/5 APIs but never executed against a live Craft
 * install. Review before use. See ../../README.md.
 */

namespace modules\ccrmlicense;

use Craft;
use craft\events\RegisterUrlRulesEvent;
use craft\web\UrlManager;
use yii\base\Event;
use yii\base\Module;

class CcrmLicense extends Module
{
    public function __construct($id, $parent = null, array $config = [])
    {
        Craft::setAlias('@modules/ccrmlicense', __DIR__);
        $this->controllerNamespace = 'modules\\ccrmlicense\\controllers';

        parent::__construct($id, $parent, $config);
    }

    public function init(): void
    {
        parent::init();

        // One public route. Deliberately a site route rather than a CP one: the
        // callers are customer installations, not signed-in Craft users.
        Event::on(
            UrlManager::class,
            UrlManager::EVENT_REGISTER_SITE_URL_RULES,
            static function (RegisterUrlRulesEvent $event): void {
                $event->rules['ccrm-license/validate'] = 'ccrm-license/validate/index';
            }
        );
    }
}
