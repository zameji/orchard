import { profiles } from './sim/config.js';
import { Tree } from './sim/tree.js';
import { Advisor } from './app/advice.js';
import { Ui } from './app/ui.js';
import { Studio } from './app/studio.js';
import { Stage } from './render/scene.js';
import { TreeMesh } from './render/tree-mesh.js';

const ui = new Ui();
const config = ui.readConfig();
const stage = new Stage();
const treeMesh = new TreeMesh(stage);
const studio = new Studio({
  tree: new Tree(config.seed),
  stage,
  treeMesh,
  advisor: new Advisor(
    profiles[config.profile],
    profiles[config.profile].sys,
    config.start,
  ),
  ui,
});
studio.boot();
