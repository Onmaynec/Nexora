# Publishing the GitHub Wiki

The Markdown files in `docs/wiki/` are the reviewed source for the repository Wiki. GitHub stores the rendered Wiki in the separate `Onmaynec/Nexora.wiki` repository.

## Initial publication

GitHub requires the Wiki to be initialized once from the repository **Wiki** tab. After the first page exists, clone the Wiki repository and copy the reviewed pages:

```bash
git clone https://github.com/Onmaynec/Nexora.wiki.git
cp docs/wiki/*.md Nexora.wiki/
cd Nexora.wiki
git add .
git commit -m "docs: publish Nexora project wiki"
git push origin master
```

Use the default branch exposed by the Wiki repository if it differs from `master`.

## Page mapping

| Source file | Wiki page |
|---|---|
| `Home.md` | Home |
| `_Sidebar.md` | Navigation sidebar |
| `Getting-Started.md` | Getting Started |
| `Architecture.md` | Architecture |
| `Security-and-Privacy.md` | Security and Privacy |
| `Development-and-Testing.md` | Development and Testing |
| `Releases-and-Roadmap.md` | Releases and Roadmap |
| `Operations-and-Support.md` | Operations and Support |

## Maintenance policy

- Edit and review source pages in the main repository first.
- Publish only after the documentation PR is merged.
- Keep current product claims aligned with `main`.
- Preserve historical release evidence instead of rewriting it.
- Never publish secrets, private data, databases, backups or real message content.
- Update the roadmap issue links when issue numbers or release sequencing changes.

## Verification

After publication:

1. Open every page from the sidebar.
2. Check repository-relative links and Mermaid diagrams.
3. Confirm the current version and distribution classification.
4. Verify that no development branch is described as released.
5. Compare the roadmap table with `ROADMAP.md` and `PROJECTS.md`.