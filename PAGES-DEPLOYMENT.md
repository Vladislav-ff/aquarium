# NACRE: verified GitHub Pages build

This deployment preserves the existing NACRE VI scene in aquarium.html. It does NOT claim to be the separate experimental VII implementation discussed in chat.

## Fixes
- Rebuilds the embedded engine from ecology-core (2).js, matching ecology-app.js.
- Rejects attacks by dead predators; validates maturity, proximity and condition at spawning.
- Prevents negative contact correction.
- Uses local Three.js 0.169.0, including its license, instead of a runtime CDN dependency.
- Publishes dist only, not old ZIPs or inconsistent root assets.

## One-time Pages setup
In Settings > Pages > Build and deployment select GitHub Actions. Then re-run Verify and deploy aquarium if its deployment failed before this setting was enabled.

The site address is expected to be https://vladislav-ff.github.io/aquarium/ after a successful Pages deployment. This is not a statement that the site is already live.

## Tests
The workflow tests conservation, persistence, two autonomous 120-second runs, and actual Chromium WebGL rendering without external network access. Deployment depends on all tests passing. Screenshots and results are in the aquarium-verification workflow artifact. Tests are provided, not pre-certified as passing.

## Local build
Requires Python 3 and Node.js 22.

    npm install --prefix .ci --no-audit --no-fund --no-package-lock three@0.169.0 playwright@1.56.1
    python scripts/build-pages.py
    python -m http.server 8000 --directory dist

Open http://localhost:8000/ . Build output index.html contains the original scene, matching engine and interface. The root index.html redirects to aquarium.html for legacy branch-based serving; Actions publishes the rebuilt dist/index.html instead.

## Limitations
Fictional species and accelerated ecology; no guaranteed perpetual coexistence. Collisions are approximate capsules. Water is not a Navier-Stokes solver. Browser performance is device-dependent. No original files or archives are deleted by this change.
