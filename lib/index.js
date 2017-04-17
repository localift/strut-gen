"use strict"

const path = require("path")
const _ = require("lodash")
const nunjucks = require("nunjucks")
const parse = require("./dom")

const cases = {
  "camelcase": _.camelCase,
  "pascalcase": _.flow(_.camelCase, _.upperFirst)
}

function generate(target, filePath) {
  const targetPath = path.join(`${__dirname}/targets/${target}`)
  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(targetPath), {
    throwOnUndefined: true,
    dev: { withInternals: true }
  })
  const tmpl = env.getTemplate("main.njk", true)

  _.forEach(cases, (v, k) => {
    env.addFilter(k, v)
  })

  return parse(filePath).then(dom => {
    const target = require(targetPath)

    _.forEach(target.filters, (v, k) => {
      env.addFilter(k, v)
    })

    return tmpl.render({ api: dom })
  })
}

module.exports = generate
