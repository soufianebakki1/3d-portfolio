import { useEffect, useRef } from "react";
import * as THREE from "three";

const DOT_SPACING = 40;
const DOT_SIZE = 3.2;
const MOUSE_RADIUS = 170;
const MAX_LIFT = 90;
const MAX_TILT = 0.16;
const MAX_PARALLAX = 25;
const DOT_COLOR = new THREE.Color(0xc2a4ff);

const VERTEX_SHADER = `
  attribute float aScale;
  uniform float uSize;
  varying float vDepth;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize * aScale * (900.0 / -mvPosition.z);
    vDepth = clamp(1.0 - (-mvPosition.z - 900.0) / 600.0, 0.55, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vDepth;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    float alpha = (1.0 - smoothstep(0.35, 0.5, dist)) * uOpacity * vDepth;
    if (alpha <= 0.0) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const VantaDotsBackground = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseNdcRef = useRef(new THREE.Vector2(10, 10));

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
    const group = new THREE.Group();
    scene.add(group);

    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const mouseWorld = new THREE.Vector3(9999, 9999, 0);

    let width = 0;
    let height = 0;
    let points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
    let baseX: Float32Array | null = null;
    let baseY: Float32Array | null = null;
    let positions: Float32Array | null = null;
    let scales: Float32Array | null = null;

    const buildGrid = (w: number, h: number) => {
      if (points) {
        group.remove(points);
        points.geometry.dispose();
        points.material.dispose();
      }

      const cols = Math.ceil(w / DOT_SPACING) + 1;
      const rows = Math.ceil(h / DOT_SPACING) + 1;
      const count = cols * rows;

      positions = new Float32Array(count * 3);
      scales = new Float32Array(count).fill(1);
      baseX = new Float32Array(count);
      baseY = new Float32Array(count);

      let i = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * DOT_SPACING - w / 2;
          const y = h / 2 - row * DOT_SPACING;
          positions[i * 3] = x;
          positions[i * 3 + 1] = y;
          positions[i * 3 + 2] = 0;
          baseX[i] = x;
          baseY[i] = y;
          i++;
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));

      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uSize: { value: DOT_SIZE * Math.min(window.devicePixelRatio, 2) },
          uColor: { value: DOT_COLOR },
          uOpacity: { value: 0.85 },
        },
        transparent: true,
        depthWrite: false,
      });

      points = new THREE.Points(geometry, material);
      group.add(points);
    };

    const resize = () => {
      width = wrapper.clientWidth;
      height = wrapper.clientHeight;
      if (width === 0 || height === 0) return;

      renderer.setSize(width, height);
      camera.aspect = width / height;
      const distance = height / 2 / Math.tan((camera.fov / 2) * (Math.PI / 180));
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();

      buildGrid(width, height);
    };

    resize();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = wrapper.getBoundingClientRect();
      mouseNdcRef.current.set(
        ((e.clientX - rect.left) / width) * 2 - 1,
        -((e.clientY - rect.top) / height) * 2 + 1
      );
    };
    const handleMouseLeave = () => {
      mouseNdcRef.current.set(10, 10);
    };

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(wrapper);
    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    const clock = new THREE.Clock();
    let frameId: number;
    let tiltX = 0;
    let tiltY = 0;
    let parallaxX = 0;
    let parallaxY = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (!points || !baseX || !baseY || !positions || !scales) return;

      const t = clock.getElapsedTime();

      raycaster.setFromCamera(mouseNdcRef.current, camera);
      raycaster.ray.intersectPlane(groundPlane, mouseWorld);

      for (let i = 0; i < scales.length; i++) {
        const dx = baseX[i] - mouseWorld.x;
        const dy = baseY[i] - mouseWorld.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const influence = Math.max(0, 1 - dist / MOUSE_RADIUS);
        const eased = influence * influence;
        const idle = 1 + 0.12 * Math.sin(t * 1.4 + baseX[i] * 0.02 + baseY[i] * 0.02);

        scales[i] = idle * (1 + eased * 2.2);
        positions[i * 3 + 2] = eased * MAX_LIFT + Math.sin(t * 0.8 + baseX[i] * 0.01) * 4;
      }
      points.geometry.attributes.aScale.needsUpdate = true;
      points.geometry.attributes.position.needsUpdate = true;

      const targetTiltY = mouseNdcRef.current.x !== 10 ? mouseNdcRef.current.x * MAX_TILT : 0;
      const targetTiltX = mouseNdcRef.current.y !== 10 ? -mouseNdcRef.current.y * MAX_TILT : 0;
      const targetParallaxX = mouseNdcRef.current.x !== 10 ? mouseNdcRef.current.x * MAX_PARALLAX : 0;
      const targetParallaxY = mouseNdcRef.current.y !== 10 ? mouseNdcRef.current.y * MAX_PARALLAX : 0;

      tiltX += (targetTiltX - tiltX) * 0.04;
      tiltY += (targetTiltY - tiltY) * 0.04;
      parallaxX += (targetParallaxX - parallaxX) * 0.04;
      parallaxY += (targetParallaxY - parallaxY) * 0.04;

      group.rotation.x = tiltX;
      group.rotation.y = tiltY + Math.sin(t * 0.15) * 0.02;
      group.position.x = parallaxX;
      group.position.y = parallaxY;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      if (points) {
        points.geometry.dispose();
        points.material.dispose();
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={wrapperRef} className="whatIDO-vanta-bg" aria-hidden="true">
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
};

export default VantaDotsBackground;
