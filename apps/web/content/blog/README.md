# Inside SingJam posts

Each file in this folder is one post on the monthly engineering blog. Published
posts appear at `singjam.org/blog`, `inside.singjam.org` and in the native app.

## Writing a post

1. Copy `_template.md` to `<slug>.md`, e.g. `november-2026.md`. The file name is
   the URL: `inside.singjam.org/november-2026`. Lowercase letters, numbers and
   single hyphens only.
2. Fill in the frontmatter and write the post in Markdown.
3. Keep `draft: true` while writing. `npm run dev` in `apps/web` shows drafts at
   `localhost:3000/blog`; production never does.
4. Open a PR and request review from the approvers. When they approve, delete the
   `draft: true` line and merge on release day. The post goes live with that deploy.

## Frontmatter

| Key | Required | Notes |
|---|---|---|
| `title` | yes | |
| `date` | yes | `YYYY-MM-DD`, shown on the post and used for ordering |
| `author` | no | |
| `summary` | no | One line for the blog list and link previews |
| `cover` | no | `https://` image URL |
| `draft` | no | `true` hides the post in production |

## Markdown that's supported

`#`, `##`, `###` headings; paragraphs; `-` and `1.` lists; `>` quotes; fenced
` ``` ` code blocks; `---` rules; `![alt](https://…)` images on their own line;
and inline `**bold**`, `*italic*`, `` `code` `` and `[links](https://…)`. HTML
is shown as text. Unit tests fail if a post's frontmatter is invalid.
