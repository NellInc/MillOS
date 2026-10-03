import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { reuseBeautyTransforms } from './transparencyTransforms';

// Execute the installed dependency's real method, rather than copying its
// visibility/target contract. Native WebGL controls separately prove rendering.
const source = ts.createSourceFile(
  'N8AOPostPass.js',
  readFileSync('node_modules/n8ao/src/N8AOPostPass.js', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS
);
const declaration = source.statements.find(
  (node): node is ts.ClassDeclaration =>
    ts.isClassDeclaration(node) && node.name?.text === 'N8AOPostPass'
);
const method = declaration?.members.find(
  (node): node is ts.MethodDeclaration =>
    ts.isMethodDeclaration(node) && node.name.getText(source) === 'renderTransparency'
);
if (!method?.body) throw new Error('Installed N8AO transparency contract changed');
const nativeTransparency = new Function(
  'THREE',
  'DepthType',
  `return function(renderer) ${method.body.getText(source)}`
)(THREE, { Reverse: Symbol('reverse') }) as (renderer: THREE.WebGLRenderer) => void;

function fixture() {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera();
  const make = (name: string, transparent: boolean, depthWrite: boolean) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ transparent, depthWrite })
    );
    mesh.name = name;
    scene.add(mesh);
    return mesh;
  };
  const opaque = make('opaque', false, true),
    overlay = make('overlay', true, false),
    pane = make('pane', true, true);
  const hidden = new THREE.Group();
  hidden.visible = false;
  scene.add(hidden);
  const hiddenMesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial({ transparent: true })
  );
  hidden.add(hiddenMesh);
  const pass = {
    scene,
    camera,
    needsDepthTexture: true,
    configuration: { depthBufferType: Symbol('default') },
    depthTexture: new THREE.DepthTexture(16, 16),
    transparencyRenderTargetDWFalse: new THREE.WebGLRenderTarget(16, 16),
    transparencyRenderTargetDWTrue: new THREE.WebGLRenderTarget(16, 16),
    depthCopyPass: {
      material: {
        uniforms: { depthTexture: { value: null }, reverseDepthBuffer: { value: false } },
      },
      render: vi.fn(),
    },
    renderTransparency: nativeTransparency,
  };
  const draws: Array<{ objects: string[]; position: number[]; camera: number[] }> = [];
  const renderer = {
    autoClearDepth: true,
    getClearColor: (target: THREE.Color) => target.set('#123456'),
    getClearAlpha: () => 0.7,
    setClearColor: vi.fn(),
    setRenderTarget: vi.fn(),
    clear: vi.fn(),
    render: (s: THREE.Scene, c: THREE.Camera) => {
      if (s.matrixWorldAutoUpdate) s.updateMatrixWorld();
      if (c.parent === null && c.matrixWorldAutoUpdate) c.updateMatrixWorld();
      const objects: string[] = [];
      s.traverseVisible((o) => {
        if (o instanceof THREE.Mesh) objects.push(o.name);
      });
      draws.push({
        objects,
        position: [...pane.matrixWorld.elements],
        camera: [...c.matrixWorld.elements],
      });
    },
  };
  return {
    scene,
    camera,
    opaque,
    overlay,
    pane,
    hidden,
    hiddenMesh,
    pass,
    draws,
    renderer: renderer as unknown as THREE.WebGLRenderer,
  };
}

describe('N8AO same-frame beauty transform reuse', () => {
  it('keeps both actual transparency renders, target copies and visibility without repeating transforms', () => {
    const f = fixture();
    f.scene.updateMatrixWorld();
    f.camera.updateMatrixWorld();
    const sceneUpdates = vi.spyOn(f.scene, 'updateMatrixWorld'),
      cameraUpdates = vi.spyOn(f.camera, 'updateMatrixWorld');
    const release = reuseBeautyTransforms(f.pass);
    f.pass.renderTransparency(f.renderer);
    expect(f.draws.map((row) => row.objects)).toEqual([['overlay'], ['pane']]);
    expect(f.pass.depthCopyPass.render).toHaveBeenCalledTimes(2);
    expect(sceneUpdates).not.toHaveBeenCalled();
    expect(cameraUpdates).not.toHaveBeenCalled();
    expect(f.scene.matrixWorldAutoUpdate).toBe(true);
    expect(f.camera.matrixWorldAutoUpdate).toBe(true);
    expect([
      f.opaque.visible,
      f.overlay.visible,
      f.pane.visible,
      f.hidden.visible,
      f.hiddenMesh.visible,
    ]).toEqual([true, true, true, false, true]);
    expect(f.renderer.autoClearDepth).toBe(true);
    release();
  });

  it('uses each new beauty pose and camera, with no next-frame transform cache', () => {
    const f = fixture();
    reuseBeautyTransforms(f.pass);
    for (const x of [2, 5]) {
      f.pane.position.x = x;
      f.camera.position.x = -x;
      // Real RenderPass prepares these before N8AOPostPass in every frame.
      f.scene.updateMatrixWorld();
      f.camera.updateMatrixWorld();
      f.pass.renderTransparency(f.renderer);
      expect(f.draws.at(-1)?.position[12]).toBe(x);
      expect(f.draws.at(-1)?.camera[12]).toBe(-x);
    }
    expect(f.draws).toHaveLength(4);
  });

  it('restores both original auto-update flags when the pass throws', () => {
    const f = fixture();
    f.scene.matrixWorldAutoUpdate = false;
    f.pass.renderTransparency = () => {
      expect(f.scene.matrixWorldAutoUpdate).toBe(false);
      expect(f.camera.matrixWorldAutoUpdate).toBe(false);
      throw new Error('render failed');
    };
    reuseBeautyTransforms(f.pass);
    expect(() => f.pass.renderTransparency(f.renderer)).toThrow('render failed');
    expect(f.scene.matrixWorldAutoUpdate).toBe(false);
    expect(f.camera.matrixWorldAutoUpdate).toBe(true);
  });

  it('restores its method on detach and never overwrites a subsequent owner', () => {
    const f = fixture(),
      original = f.pass.renderTransparency,
      release = reuseBeautyTransforms(f.pass);
    expect(f.pass.renderTransparency).not.toBe(original);
    release();
    expect(f.pass.renderTransparency).toBe(original);
    const nextRelease = reuseBeautyTransforms(f.pass),
      laterOwner = vi.fn();
    f.pass.renderTransparency = laterOwner;
    nextRelease();
    expect(f.pass.renderTransparency).toBe(laterOwner);
  });

  it('declines standalone/unrecognised passes that lack the prepared beauty-depth contract', () => {
    const f = fixture();
    f.pass.needsDepthTexture = false;
    const original = f.pass.renderTransparency;
    reuseBeautyTransforms(f.pass)();
    expect(f.pass.renderTransparency).toBe(original);
    expect(() => reuseBeautyTransforms(null)()).not.toThrow();
  });
});
