#!/usr/bin/env node

"use strict"

const program = require("commander")
const generate = require("../lib")
const fs = require("fs")

program
  .version("0.3.0")
  .usage("[options] <target> <spec>")
  .arguments("<spec> <target>")
  .option("-o, --output [dir]", "Desired output path")
  .option("-c, --config [json]", "JSON configuration file", (fn) => {
    return JSON.parse(fs.readFileSync(fn, "utf8"))
  })
  .action((target, spec) => {
    generate(target, spec)
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .then((v) => {
      console.log(v)
      //console.log("Done!")
    })
    .catch(err => {
      console.error(err.stack)
    })
  })
  .parse(process.argv)

if (process.argv.length < 3) {
  program.help()
}
