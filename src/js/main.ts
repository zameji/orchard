import { Tree } from './sim/tree.js';
import { resolve } from './sim/spec.js';
import { Advisor } from './app/advice.js';
import { Ui } from './app/ui.js';
import { Studio } from './app/studio.js';
import { Stage } from './render/scene.js';
import { TreeMesh } from './render/tree-mesh.js';

const ui = new Ui();
const config = ui.readConfig();
const spec = resolve(
  config.species,
  config.habit,
  config.cultivar,
  config.form,
);
const stage = new Stage();
const treeMesh = new TreeMesh(stage);
const studio = new Studio({
  tree: new Tree(config.seed),
  stage,
  treeMesh,
  advisor: new Advisor(spec, config.practice, config.start),
  ui,
});
studio.boot();
