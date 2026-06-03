<?php
namespace CCRM;

use Composer\Composer;
use Composer\IO\IOInterface;
use Composer\Plugin\PluginInterface;
use Composer\EventDispatcher\EventSubscriberInterface;
use Composer\Script\ScriptEvents;

class ComposerPlugin implements PluginInterface, EventSubscriberInterface {
    protected $composer;
    protected $io;

    public function activate(Composer $composer, IOInterface $io) {
        $this->composer = $composer;
        $this->io = $io;
    }

    public function deactivate(Composer $composer, IOInterface $io) {
    }

    public function uninstall(Composer $composer, IOInterface $io) {
    }

    public static function getSubscribedEvents() {
        return [
            ScriptEvents::POST_INSTALL_CMD => 'onPostInstallUpdate',
            ScriptEvents::POST_UPDATE_CMD => 'onPostInstallUpdate',
        ];
    }

    public function onPostInstallUpdate() {
        $this->io->write('<info>CCRM Plugin: Publishing frontend assets...</info>');
        if (Installer::publishAssets()) {
            $this->io->write('<info>CCRM Plugin: Assets successfully published to project webroot.</info>');
        } else {
            $this->io->write('<error>CCRM Plugin: Failed to publish assets. Ensure dist/ folder is present.</error>');
        }
    }
}
