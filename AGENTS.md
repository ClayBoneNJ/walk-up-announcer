# Project release rule

For every completed project change, always finish the release workflow before handing the task back:

1. Increment the numeric `v#` build number in all three locations: `v2/src/App.jsx` (`APP_BUILD_LABEL`), `v2/src/lib/sampleData.js` (`AUDIO_ASSET_VERSION`), and `v2/public/sw.js` (`CACHE_NAME`). Keep the three values identical.
2. Run `npm.cmd run build` from `v2` and confirm it succeeds.
3. Commit all files belonging to the requested change, including new assets and the version bump.
4. Push the commit to `origin/main`.
5. Confirm the `Deploy GitHub Pages` workflow triggered by the push completes successfully. Do not report the task complete until the published deployment succeeds; if it fails, diagnose and fix it.

