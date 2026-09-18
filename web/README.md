# cobalt web
the cobalt frontend is a static web app built with
[sveltekit](https://kit.svelte.dev/) + [vite](https://vitejs.dev/).

## configuring
- to run a dev environment, run `pnpm run dev`.
- to make a release build of the frontend, run `pnpm run build`.

## environment variables
the frontend has several build-time environment variables for configuring various features. to use
them, you must specify them when building the frontend (or running a vite server for development).

| name                 | example                     | description                                                                                              |
|:---------------------|:----------------------------|:---------------------------------------------------------------------------------------------------------|
| `WEB_HOST`           | `cobalt.tools`              | domain on which the frontend will be running. used for meta tags and configuring plausible.              |
| `WEB_PLAUSIBLE_HOST` | `plausible.io`*             | enables plausible analytics with provided hostname as receiver backend.                                  |
| `WEB_DEFAULT_API`    | `https://api.cobalt.tools/` | changes url which is used for api requests by frontend clients.                                          |
| `WEB_CLERK_PUBLISHABLE_KEY` | `pk_test_...` | enables Clerk authentication (sign in / sign up) in the frontend.                                        |
| `WEB_VIDEO_AGENT_ENABLED` | `1` | shows the Video Agent preview workspace and its AI Video submenu. Defaults to enabled in development and disabled in production. Set `0` to disable it locally too. |
| `WEB_TURNSTILE_KEY`  | `1x00000000000000000000AA`  | [cloudflare turnstile](https://www.cloudflare.com/products/turnstile/) public key for antibot protection |

\* don't use plausible.io as receiver backend unless you paid for their cloud service.
   use your own domain when hosting community edition of plausible. refer to their [docs](https://plausible.io/docs) when needed.

## Video Agent workspace preview

The main navigation keeps its AI Video entry. Inside `/<lang>/ai-video`, a page
sidebar uses the same navigation components and layout as the admin console.
It contains Highlight Studio (the existing route and processing flow) and
Video Agent at `/<lang>/ai-video/video-agent`. On mobile, this page navigation
appears above the content; the global More menu retains one AI Video entry.
Earlier `/<lang>/video-agent` preview links redirect to the nested route.
The same build-time flag controls the Video Agent submenu and direct route
access; a disabled route returns 404. Restart the development server after
changing the flag. Production changes require the next user-run build/deployment.

This first stage provides the project, conversation, and results layout, editable
prompt/link inputs, and example prompts. Upload and execution remain disabled
until the backend stages are implemented. It does not create projects, send
prompts to an AI service, or consume membership minutes. No project detail route
is exposed before real project loading and ownership checks exist.

See [the detailed design](../docs/video-agent-design.md) for the next stages.

## license
cobalt web code is licensed under [CC-BY-NC-SA-4.0](LICENSE).

this license allows you to:
- copy and redistribute the code in any medium or format, and
- remix, transform, use and build upon the code

as long as you:
- give appropriate credit to the original repo,
- provide a link to the license and indicate if changes to the code were made,
- release the code under the **same license**, and
- **don't use the code for any commercial purposes**.

cobalt branding, mascots, and other related assets included in the repo are ***copyrighted*** and not covered by the license. you ***cannot*** use them under same terms.

you are allowed to host an ***unmodified*** instance of cobalt with branding for **non-commercial purposes**, but this ***does not*** give you permission to use the branding anywhere else, or make derivatives of it in any way.

when making an alternative version of the project, please replace or remove all branding (including the name).

## 3rd party licenses
- [Fluent Emoji by Microsoft](https://github.com/microsoft/fluentui-emoji) (used in cobalt) is under [MIT](https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE) license.
- [Noto Sans Mono](https://fonts.google.com/noto/specimen/Noto+Sans+Mono/) fonts (used in cobalt) are licensed under the [OFL](https://fonts.google.com/noto/specimen/Noto+Sans+Mono/about) license.
- many update banners were taken from [tenor.com](https://tenor.com/).
