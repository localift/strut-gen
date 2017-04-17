"use strict"

const SwaggerParser = require("swagger-parser")
const find = require("lodash.find")
let debug
try {
  debug = require("debug")("strut-dom")
} catch (err) {
  debug = function(){}
}

function lazy(obj, key, func, enumerable) {
  Object.defineProperty(obj, key, {
    get: () => {
      const value = func()
      Object.defineProperty(obj, key, {
        enumerable, value
      })
      return value
    },
    configurable: true,
    enumerable
  })
}

function parsePaths(root, paths) {
  const o = {}
  const { $refs } = root.parser

  for (const k in paths) {
    if (k === "$ref") {
      // Object.assign(o, $refs.get(k))
    }

    const v = paths[k]
    const url = v["x-strut-url"] || k

    o[url] = new PathNode(root, k, v)
  }

  return o
}

function getDefn(node, ref) {
  const val = getRef(node, ref)
  val.name = getRefName(ref)
  return val
}

function getRef(node, ref) {
  const key = getRefName(ref)
  const o = node.root().definitions[key]

  if (o == null) {
    throw new Error(`No definition found for ${ref}`)
  }

  return o
}

function getRefName(ref) {
  const chunks = ref.split("/")
  return chunks[chunks.length - 1]
}

class StrutNode {
  constructor(parent, raw) {
    if (parent && raw) {
      Object.defineProperties(this, {
        parent: { value: parent },
        raw: { value: raw }
      })
    }
  }

  root() {
    let o = this

    while (o.parent) {
      o = o.parent
    }

    return o
  }
}

class RootNode {
  constructor(parser) {
    Object.defineProperties(this, {
      parser: { value: parser },
      raw: { value: parser.api }
    })

    this.definitions = {}

    for (const k in this.raw.definitions) {
      this.definitions[k] = new DefinitionNode(this, k, this.raw.definitions[k])
    }

    this.paths = parsePaths(this, this.raw.paths)

    for (const k in this.raw) {
      if (k.startsWith("x-") || k === "definitions" || k === "paths") {
        continue
      }

      Object.defineProperty(this, k, { value: this.raw[k], enumerable: true })
    }

    if (this.basePath == null) {
      Object.defineProperty(this, "basePath", { value: "", enumerable: true })
    }
  }

  operations() {
    const o = []

    for (const k in this.paths) {
      const v = this.paths[k]

      for (const method in v) {
        if (!v[method].operationId) {
          continue
        }

        o.push(v[method])
      }
    }

    return o
  }

  taggedOps(fallback) {
    const tags = {}

    for (const op of this.operations()) {
      let tag

      if (op.tags == null) {
        tag = "Default"
      } else {
        tag = op.tags[0] || fallback || "Default"
      }

      tags[tag] || (tags[tag] = [])
      tags[tag].push(op)
    }

    return tags
  }
}

function lazyProp(target, source, key, prop) {
  return lazy(target, key, () => {
    let v

    if (prop.$ref) {
      v = getRef(source, prop.$ref)
    } else {
      v = prop
    }

    return new PropertyNode(source, key, v)
  }, true)
}

class PropertiesNode extends StrutNode {
  constructor(parent, raw) {
    super(parent, raw)

    for (const k in raw) {
      if (k.startsWith("x-")) {
        continue
      }

      const prop = raw[k]

      lazyProp(this, parent, k, prop)
    }
  }
}

/*
class ItemsNode {
  constructor(parent, raw) {
    super(parent, raw)

    if (raw.$ref) {

    }

    for (const k in raw) {
      if (k.startsWith("x-")) {
        continue
      }

      const prop = raw[k]

      lazy(this, k, () => {
        let v

        if (prop.$ref) {
          v = getRef(parent, prop.$ref)
        } else {
          v = prop
        }

        return new PropertyNode(parent, k, v)
      }, true)
    }
  }
}
*/


class PropertyNode extends StrutNode {
  constructor(parent, name, raw) {
    super(parent, raw)

    Object.defineProperty(this, "isRequired", {
      value: () => {
        return parent.required && parent.required.indexOf(name) > -1
      }
    })

    if (raw.type === "array" && raw.items.$ref) {
      lazy(this, "items", () => getRef(this, raw.items.$ref), true)
    } else {
      Object.defineProperty(this, "items", { value: raw.items, enumerable: true })
    }

    for (const k in raw) {
      if (raw.items && k === "items") {
        continue
      }

      Object.defineProperty(this, k, {
        value: raw[k],
        enumerable: true
      })
    }

    if (this.enum) {
      this.enum.name = name
    }
  }
}

class DefinitionNode extends StrutNode {
  constructor(root, name, raw) {
    super(root, raw)

    this.name = name

    for (const k in raw) {
      if (k.startsWith("x-") || k === "properties" || k === "items") {
        continue
      }

      if (k === "enum") {
        raw[k].name = name
      }

      Object.defineProperty(this, k, { value: raw[k], enumerable: true })
    }

    if (this.type === "object") {
      this.properties = new PropertiesNode(this, raw.properties)
    } else if (this.type === "array") {
      if (raw.items.$ref) {
        lazy(this, "items", () => getRef(this, raw.items.$ref), true)
      } else {
        Object.defineProperty(this, "items", { value: raw.items, enumerable: true })
      }
    }
  }

  enums() {
    const o = {}

    for (const k in this.properties) {
      const prop = this.properties[k]

      if (prop.enum && prop.name == null) {
        o[prop.enum.name] = prop.enum
      }
    }

    return o
  }

  hasEnums() {
    return Object.keys(this.enums()).length > 0
  }

  hasRequired() {
    for (const key in this.properties) {
      if (this.properties[key].isRequired()) {
        return true
      }
    }

    return false
  }
}

class PathNode extends StrutNode {
  constructor(root, pattern, raw) {
    super(root, raw)

    const self = this

    Object.defineProperty(this, "pattern", {
      value: pattern
    })

    for (const k in raw) {
      if (k.startsWith("x-")) {
        continue
      }

      if (k === "parameters") {
        Object.defineProperty(this, k, {
          value: new ParametersNode(self, raw[k])
        })
        continue
      }

      Object.defineProperty(this, k, {
        value: new OperationNode(self, k, raw[k]),
        enumerable: true
      })
    }
  }

  get url() {
    return this.raw["x-strut-url"] || this.pattern
  }
}

class ParametersNode extends StrutNode {
  constructor(parent, raw) {
    super(parent, raw)

    Object.defineProperty(this, "rawValues", {
      value: raw.map(r => new ParameterNode(this, r))
    })
  }

  values() {
    if (this.parent && this.parent.parameters) {
      return this.parent.parameters.rawValues.concat(this.rawValues || [])
    }

    return this.rawValues
  }

  body() {
    return this.values().filter(p => p.in === "body")[0]
  }

  path() {
    return this.values().filter(p => p.in === "path")
  }

  query() {
    return this.values().filter(p => p.in === "query")
  }

  header() {
    return this.values().filter(p => p.in === "header")
  }

  formData() {
    return this.values().filter(p => p.in === "formData")
  }
}

class ParameterNode extends StrutNode {
  constructor(parent, raw) {
    super(parent, raw)

    for (const k in raw) {
      if ((k === "schema" || k === "x-strut-schema") && raw[k].$ref) {
        const ref = raw[k].$ref

        Object.defineProperty(this, "schema", {
          get: () => getRef(this, ref),
          enumerable: true
        })

        continue
      }

      if (k.startsWith("x-")) {
        continue
      }

      Object.defineProperty(this, k, { value: raw[k], enumerable: true })
    }
  }
}

class OperationNode extends StrutNode {
  constructor(parent, method, raw) {
    super(parent, raw)

    Object.defineProperty(this, "method", { value: method })

    for (const k in raw) {
      if (k.startsWith("x-") || k === "parameters") {
        continue
      }

      Object.defineProperty(this, k, { value: raw[k], enumerable: true })
    }

    // If no params, the parent might have some, so we need a getter either way.
    if (!this.parameters) {
      this.parameters = new ParametersNode(this.parent, raw.parameters || [])
    }
  }

  get url() {
    return this.parent.url
  }

  get consume() {
    if (this.consumes) {
      return this.consumes[0]
    }

    const rootConsumes = this.root().consumes

    if (rootConsumes) {
      return rootConsumes[0]
    }

    return null
  }

  get returns() {
    if (this.responses) {
      const res = find(this.responses, (it, key) => {
        return String(key).startsWith("2")
      })

      if (res.schema && res.schema.$ref) {
        return getRef(this, res.schema.$ref)
      }
    }

    return null
  }
}

class SecurityRequirementNode {

}

class SecuritySchemeNode {

}

class ResponseNode {

}

class HeadersNode {

}

function parse(filePath) {
  const parser = new SwaggerParser()

  return parser.parse(filePath).then(api => {
    return new RootNode(parser)
  })
}

module.exports = parse
