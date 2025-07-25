A Node.js tool for downloading free and paid Substack posts, including images and videos, and converting them to Markdown.

> [!IMPORTANT]
> This tool may not work for you. I used it for downloading the one Substack I wanted to download, and I haven't tested it with other ones.

See similar tools:
* https://github.com/alexferrari88/sbstck-dl
* https://github.com/timf34/Substack2Markdown

## Prerequisites

You'll need [Node.js](https://nodejs.org) version at least 23 (my version is `v23.11.0`), and [pnpm](https://pnpm.io/) (my version is 10.13.1).

If you have older `Node.js`, you can install `vite-node` with `pnpm install vite-node` and use `pnpm exec vite-node` instead of `node` in the commands.

If you use [npm](https://www.npmjs.com/), you can replace `pnpm` with `npm`, and `pnpm exec` with `npx`, in the commands.

## Installation

In the root of the project, execute:
```shell
pnpm install
```

## Downloading the content

### 1. Configure the project

The project reads configuration file `/config.ts` in the root of the project. Example config file:

```typescript
export default {
    substackBaseUrl: "https://username.substack.com",
    dataDirectory: './data',
}
```

`dataDirectory` is where the downloaded content will be placed, relative to the config (you can also use absolute path).

### 2. Download list of posts

First, download the list of posts:

```shell
node src/fetchPostList.ts
```

They are saved in the data directory in `postList/posts.json`

### 3. Setting up cookies

If you plan to download a paid Substack, you'll need to sign into your account. For that, first execute:

```shell
pnpm exec puppeteer browsers install chrome
```

then execute:

```shell
node src/setupCookie.ts
```

sign into your account, verify that you have access, and then close the tab.

Cookies are saved in the data directory in `setupCookie/rawCookies.json`

### 4. Download the posts

Execute:

```shell
node src/downloadPosts.ts
```

This will download the posts from the list you downloaded in step 2. The posts are saved in the data directory in `rawPosts/`.

You can interrupt this command. The program will not re-download the posts. If you want to start from scratch, delete `rawPosts/` in the data directory.

### 5. Download external files

To download images and videos (except external ones like YouTube), execute:

```shell
node src/downloadExternal.ts
```

This will download files for posts from step 4. The files are saved in the data directory in `externalFiles/`.

You can interrupt this command, or run it on a subset of posts and rerun it on a larges subset later. The program will not re-download the files. If you want to start from scratch, delete `externalFiles/` in the data directory, or delete entries from `externalFiles/index.json`.

### 6. Convert to markdown

To convert the posts to markdown, execute:

```shell
node src/convertToMarkdown.ts
```

This will convert posts from step 4 to markdown files that use files from step 5. The resulting posts are saved in the data directory in `md/`. You can use programs like [Obsidian](https://obsidian.md/) to view the posts.

There's a special `index.md` that contains links to all the articles.

> [!NOTE]
> By default, assets are not copied to the `md` directory. The posts inside reference assets directly in `externalFiles`.
> If you want to change that and copy assets to `md/assets`, open `src/convertToMarkdown.ts` and change `let copyFiles = false` to `let copyFiles = true`.

## Examples

Open `example-data` directory in the root of the project to see how the data looks. There's also a `config.ts` file that you can copy to the root of the project and try using.
