# Universal Cosmos development rules

- Build an immersive exploration instrument; the Three.js viewport is the primary interface.
- Use strict TypeScript, React, Vite, direct Three.js, Zustand, Tailwind CSS, GSAP, Lucide, and Vitest. Keep dependencies small.
- React owns controls and panels. The engine owns the animation loop, scene graph, camera, picking, and resource lifecycle. Never update React state on every frame.
- Keep measured properties, scientific coordinates, and intentionally exaggerated display coordinates separate. Document units, reference frames, epochs, provenance, and approximations.
- The local catalog contains real objects. Procedural surfaces and star backgrounds are illustrative, not observations. Never describe simplified trajectories as ephemerides.
- All object access goes through the CelestialService interface. Remote HTTP mode is opt-in through environment variables. No simulated network calls.
- Design for pointer, touch, and keyboard. Keep controls accessible, panels dismissible, focus visible, and the viewport usable on narrow and short screens.
- Bound pixel ratio and geometry complexity; support all quality presets. Dispose GPU resources, observers, listeners, and animation frames on teardown.
- Avoid any, monolithic files, secrets, paid services, unnecessary infrastructure, and nonfunctional controls. Mark future exploration collections honestly.
- Validate each milestone with `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Tests should protect meaningful math, state, data, or lifecycle behavior.
- Inspect files before replacing them. Do not commit dependencies, build output, local environment files, or credentials. Do not add a license without the owner's choice.
- Work in this local repository. Publishing and pushing are outside this implementation task.
