const esbuild = require("esbuild")

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")

async function main() {
  const ctx = await esbuild.context({
    entryPoints: {
      "extension": "src/extension.ts",
      "tui-plugin": "src/tui-plugin.ts",
    },
    bundle: true,
    outdir: "dist",
    external: ["vscode"],
    format: "cjs",
    platform: "node",
    sourcemap: !production,
    minify: production,
    keepNames: true,
  })

  if (watch) {
    await ctx.watch()
    console.log("Watching for changes...")
  } else {
    await ctx.rebuild()
    console.log("Build complete")
    await ctx.dispose()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
