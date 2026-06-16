# Repository Guidelines

## Project Overview

AppSlides Studio is a client-only screenshot builder for App Store and Play Store images. It renders all artwork into an HTML canvas, stores project state in `localStorage`, imports screenshots/logos through browser file APIs, exports PNG files from canvas blobs, and exports multiple slides using the built-in uncompressed ZIP writer.

## Structure

- `index.html` contains the static application markup and Vite entry references.
- `src/styles.css` contains application shell, controls, panels, and utility UI styling.
- `src/canvas.css` contains the workspace, preview canvas, stage shell, and drag/drop preview styling.
- `src/main.js` contains application state, canvas drawing, browser file handling, persistence, and export logic.
- `package.json` defines the Vite development/build commands.

## Development

- Install dependencies with `npm install`.
- Start the local development server with `npm run dev`.
- Create a production build with `npm run build`.
- Preview the production build with `npm run preview`.

## Change Guidance

- Keep the application client-only unless a task explicitly requires a backend.
- Preserve existing browser behavior when reorganizing code: project persistence, upload/paste/drag image handling, canvas rendering, PNG export, and ZIP export should continue to work.
- Prefer small, focused modules if splitting `src/main.js`; keep drawing helpers, project state, DOM binding, and export code separated by responsibility.
- Do not introduce external runtime libraries for current canvas or ZIP behavior unless there is a concrete need.
- Test changes manually in a browser because the important workflows depend on canvas, file inputs, clipboard access, drag/drop, and downloads.
