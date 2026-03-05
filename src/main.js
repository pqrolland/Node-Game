import BootScene  from './scenes/BootScene.js';
import GameScene  from './scenes/GameScene.js';
import UIScene    from './scenes/UIScene.js';
import NodePanel  from './scenes/NodePanel.js';

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#080c14',
  // Scenes run in order — later scenes render ON TOP of earlier ones
  scene: [BootScene, GameScene, UIScene, NodePanel],
};

const game = new Phaser.Game(config);
