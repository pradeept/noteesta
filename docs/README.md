# Noteesta design and architecture

- [Setup, commands, and current limits](../README.md)
- [Backend domain layout, API routes, and verification](backend.md)
- [Current system architecture](system-architecture.md)
- [Current interactions and original design diagrams](use-cases.md)
- [Open the HTML prototype gallery](prototypes/index.html)
- [Open the original design diagram gallery](diagrams.html)
- [Prototype behavior and limitations](prototypes/README.md)

All HTML views work directly from the filesystem in a current browser. Keep the folder structure intact. Diagrams are included as standalone SVG files and editable Mermaid `.mmd` sources under `diagrams/`; no online Mermaid service is required.

The three UI directions share sample content and behavior, with different layouts and visual treatments. They are review artifacts, not the production Next.js frontend.

The SVG diagrams and Mermaid sources preserve the original proposed flows, including planned file reuse, authentication, video-frame sampling, and export storage. The architecture and interaction guides describe what the current implementation actually does. The original [hackathon plan](../plan.md) records product intent; it is not a feature-completion checklist.

