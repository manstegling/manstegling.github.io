## Welcome 

This site is under construction

## Sidebar navigation

The sidebar lists only pages with a title, `layout: page`, and explicit
`nav: true` in their YAML front matter. For example, `about.md`:

```yaml
---
layout: page
title: About
nav: true
---
```

Use the YAML boolean `true`, without quotes. Pages without `nav: true` stay
out of the sidebar, including Markdown files without front matter such as
`games/lifestream/lifestream-design-analysis.md`. They do not need `nav: false`
or any front matter to stay out of navigation. This also applies when GitHub
Pages infers a title or layout for a Markdown file.

The GitHub and LinkedIn links are added separately and always appear.
This flag only controls sidebar links; published files remain public and may
still be discovered through search engines or the repository.

## JSON files served by URL

Put future JSON content in `assets/data/`, optionally grouped by project:

```text
assets/data/lifestream/worlds.json
```

This would be served at
`https://motility.se/assets/data/lifestream/worlds.json`.
Use plain JSON without YAML front matter so Jekyll copies it as a static file.
It will not appear in the sidebar. Keep these files out of `_data/`, which is
intended for data used by Jekyll templates during the build rather than files
served directly. Do not add them to Jekyll's `exclude` list, since that would
prevent publication entirely.

These URLs are public; leaving files unlinked does not provide access control.
