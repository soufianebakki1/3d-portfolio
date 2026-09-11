import { useEffect, useRef } from "react";
import * as THREE from "three";

const POINT_COUNT = 480;
const RADIUS = 1;
const ACCENT_COLOR = new THREE.Color(0xc2a4ff);

const VERTEX_SHADER = `
  uniform float uSize;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Depth-scaled relative to the camera's distance from the sphere (not a
    // fixed pixel-space constant) since this scene's world units are ~1 unit
    // (unit sphere radius), unlike a pixel-space grid.
    gl_PointSize = uSize * (2.6 / -mvPosition.z);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    float alpha = (1.0 - smoothstep(0.3, 0.5, dist)) * uOpacity;
    if (alpha <= 0.0) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

// A lightweight, hand-built stand-in for VANTA.GLOBE: a dotted sphere with a
// faint wireframe shell, rotating slowly with a subtle mouse-driven tilt.
// Only animates while the Contact section is actually on screen and the tab
// is visible, so it never burns cycles in the background.
const VantaGlobeBackground = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 2.6;

    const group = new THREE.Group();
    scene.add(group);

    // Even point distribution via a Fibonacci sphere.
    const positions = new Float32Array(POINT_COUNT * 3);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < POINT_COUNT; i++) {
      const y = 1 - (i / (POINT_COUNT - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      positions[i * 3] = Math.cos(theta) * radiusAtY * RADIUS;
      positions[i * 3 + 1] = y * RADIUS;
      positions[i * 3 + 2] = Math.sin(theta) * radiusAtY * RADIUS;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uSize: { value: 5.5 * Math.min(window.devicePixelRatio, 1.5) },
        uColor: { value: ACCENT_COLOR },
        uOpacity: { value: 0.85 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    group.add(points);

    const wireGeometry = new THREE.IcosahedronGeometry(RADIUS * 1.001, 2);
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: ACCENT_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    });
    const wireSphere = new THREE.Mesh(wireGeometry, wireMaterial);
    group.add(wireSphere);

    const resize = () => {
      const width = wrapper.clientWidth;
      const height = wrapper.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrapper);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = wrapper.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    window.addEventListener("mousemove", handleMouseMove);

    let frameId = 0;
    let isRunning = false;
    let isIntersecting = false;
    let tiltX = 0;
    let tiltY = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      group.rotation.y += delta * 0.12;
      tiltX += (mouseRef.current.y * 0.25 - tiltX) * 0.05;
      tiltY += (mouseRef.current.x * 0.35 - tiltY) * 0.05;
      group.rotation.x = tiltX;
      wireSphere.rotation.y -= delta * 0.05;
      renderer.render(scene, camera);
    };

    const start = () => {
      if (isRunning) return;
      isRunning = true;
      clock.getDelta(); // discard the elapsed idle time before resuming
      animate();
    };
    const stop = () => {
      isRunning = false;
      cancelAnimationFrame(frameId);
    };
    const syncRunState = () => {
      if (isIntersecting && !document.hidden) start();
      else stop();
    };

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        isIntersecting = entries[0]?.isIntersecting ?? false;
        syncRunState();
      },
      { threshold: 0.01 }
    );
    intersectionObserver.observe(wrapper);
    document.addEventListener("visibilitychange", syncRunState);

    return () => {
      stop();
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("visibilitychange", syncRunState);
      geometry.dispose();
      material.dispose();
      wireGeometry.dispose();
      wireMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={wrapperRef} className="contact-globe-bg" aria-hidden="true">
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
};

export default VantaGlobeBackground;
