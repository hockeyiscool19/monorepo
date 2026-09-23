// The night over Eisenhold: gradient dome, twinkling stars, two moons (a large dusky one and a small pale
// one) and aurora curtains to the north. The dome follows the camera so it is always at infinity.

import * as THREE from 'three';
import { NIGHT } from '../palette';
import { skyFragment, skyVertex } from '../shaders';

export interface Sky {
	mesh: THREE.Mesh;
	/** Direction of the large moon — the scene's key light comes from here. */
	moonDirection: THREE.Vector3;
	update(t: number, camera: THREE.Camera, motion: number): void;
	dispose(): void;
}

export function buildSky(): Sky {
	const masserDir = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
	const secundaDir = new THREE.Vector3(-0.3, 0.55, -0.78).normalize();
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uMotion: { value: 1 },
			uZenith: { value: new THREE.Color(NIGHT.zenith) },
			uHorizon: { value: new THREE.Color(NIGHT.horizon) },
			uGround: { value: new THREE.Color(NIGHT.ground) },
			uAuroraA: { value: new THREE.Color(NIGHT.aurora[0]) },
			uAuroraB: { value: new THREE.Color(NIGHT.aurora[1]) },
			uAuroraC: { value: new THREE.Color(NIGHT.aurora[2]) },
			uMasser: { value: new THREE.Color(NIGHT.masser) },
			uSecunda: { value: new THREE.Color(NIGHT.secunda) },
			uMasserDir: { value: masserDir },
			uSecundaDir: { value: secundaDir }
		},
		vertexShader: skyVertex,
		fragmentShader: skyFragment,
		side: THREE.BackSide,
		depthWrite: false,
		fog: false
	});
	const geometry = new THREE.SphereGeometry(900, 48, 24);
	const mesh = new THREE.Mesh(geometry, material);
	mesh.frustumCulled = false;
	mesh.renderOrder = -1;
	mesh.name = 'sky';
	return {
		mesh,
		moonDirection: masserDir.clone(),
		update(t, camera, motion) {
			material.uniforms.uTime.value = t;
			material.uniforms.uMotion.value = motion;
			mesh.position.copy(camera.position);
		},
		dispose() {
			geometry.dispose();
			material.dispose();
		}
	};
}
