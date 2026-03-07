import BootScene      from './scenes/BootScene.js';
import MainMenuScene  from './scenes/MainMenuScene.js';
import GameScene      from './scenes/GameScene.js';
import UIScene        from './scenes/UIScene.js';
import NodePanel      from './scenes/NodePanel.js';
import TooltipScene   from './scenes/TooltipScene.js';

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#080c14',
  // Scenes run in order — later scenes render ON TOP of earlier ones
  scene: [BootScene, MainMenuScene, GameScene, UIScene, NodePanel, TooltipScene],
};

const game = new Phaser.Game(config);
