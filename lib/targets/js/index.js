"use strict"

const debug = require("debug")("strut:js")
const _ = require("lodash")

const RESERVED = [
]

const filters = {
  type(o, emptyType) {
    if (o === null) {
      return emptyType || "Void"
    }

    if (o.enum) {
      if (o.name) {
        return o.name
      }
      return filters.class.call(this, o.enum.name)
    } else if (o.items && o.items.enum) {
      return `[${filters.type.call(this, o.items)}]`
    }

    const format = o.format
    const type = o.type

    switch (type) {
      case null:
      case undefined:
        return "Void"
      case "integer":
        switch (format) {
          case "int64":
            return "Int64"
          case "int32":
          default:
            return "Int32"
        }
      case "number":
        switch (format) {
          case "float":
            return "Float"
          case "double":
          default:
            return "Double"
        }
      case "string":
        switch (format) {
          case "byte":
          case "binary":
            return "Uint8Array"
          case "date":
          case "date-time":
            return "Date"
          case "json":
          case "password":
          default:
            return "String"
        }
      case "boolean":
        return "Bool"
      case "array":
        debug(o.name)
        return "[" + filters.type.call(this, o.items) + "]"
      case "file":
        return "URL"
      case "object":
        if (o.name) {
          return filters.class.call(this, o.name)
        }
      default:
        return "Object"
    }
  },

  variable(name) {
    debug(name)
    const { camelcase } = this.env.filters

    const n = camelcase(name)

    if (RESERVED.indexOf(n) > -1) {
      return `\`${n}\``
    }

    if (n === "") {
      throw new Error("WTF")
    }

    return n
  },

  class(name) {
    const { pascalcase } = this.env.filters

    const n = pascalcase(name)

    if (RESERVED.indexOf(n) > -1) {
      if (n === "Type") {
        return `${n}_`
      }
      return `\`${n}\``
    }

    return n
  },

  defaultValue(defn) {
    const v = defn.default

    switch (defn.type) {
    case "string":
      return `"${v}"`
    case "array":
      return `[${v}]`
    default:
      return v
    }
  },

  enums(defn) {
    const { pascalcase } = this.env.filters
    return Object.keys(defn.enums()).map(pascalcase).join(", ")
  },

  baseUrl(project) {
    let url = project.schemes[0] + "://" + project.host

    /*
    if (project.basePath) {
      url += project.basePath
    }
    */

    return url
  },

  url(op) {
    const vars = op.parameters.values()

    let url = op.url

    for (const v of vars) {
      const vn = filters.variable.call(this, v.name)

      url = url.replace(`{${v.name}}`, `\${params.${vn}}`)
    }

    return url
  },

  values(obj) {
    return _.values(obj)
  },

  filter(obj, funcName) {
    if (Array.isArray(obj)) {
      return obj.filter(o => o[funcName]())
    } else {
      return _.filter(obj, (v, k) => v[funcName]())
    }
  },

  requiredProps(obj) {
    return _.flatMap(obj, (v, k) => v.isRequired() && k || [])
        .map(v => JSON.stringify(v))
        .join(", ")
  }
}

module.exports = {
  filters
}
