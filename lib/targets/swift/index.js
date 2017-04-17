"use strict"

const debug = require("debug")("strut:swift")
const _ = require("lodash")

const RESERVED = [
  "Type",
  "continue",
  "private",
  "public"
]

 const filters = {
   /*
  indent(str, count, indent) {
    return str.replace(/^/mg, Array(count + 1).join(" ") + indent)
  },
*/
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
            return "Int32"
          default:
            return "Int"
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
            return "Data"
          case "date":
          case "date-time":
            return "Date"
          case "json":
            return "String"
          case "password":
          default:
            return "String"
        }
      case "boolean":
        return "Bool"
      case "array":
        if (o.items.name) {
          return `[${filters.class.call(this, o.items.name)}]`
        }
        return "[" + filters.type.call(this, o.items) + "]"
      case "file":
        return "URL"
      case "object":
        if (o.name) {
          return filters.class.call(this, o.name)
        }
        return "WrappedDictionary"
      default:
        return "AnyObject"
    }
  },

  variable(name) {
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

  params(op, alwaysBraces) {
    if (!op.parameters || op.parameters.values().length === 0) {
      return alwaysBraces ? "()" : ""
    }

    const { camelcase } = this.env.filters

    const res = op.parameters.values().map(p => {
      if (p.default != null) {
        return `${camelcase(p.name)}: ${filters.type.call(this, p.schema || p)}${p.required ? "" : (alwaysBraces ? ` = ${p.default}` : "?")}`
      } else {
        return `${camelcase(p.name)}: ${filters.type.call(this, p.schema || p)}${p.required ? "" : (alwaysBraces ? `? = nil` : "?")}`
      }
    }).join(", ")

    return `(${res})`
  },

  paramVals(op) {
    if (!op.parameters || op.parameters.values().length === 0) {
      return ""
    }

    const { camelcase } = this.env.filters

    const res = op.parameters.values().map(p => {
      const n = camelcase(p.name)
      return `${n}: ${n}`
    }).join(", ")

    return `(${res})`
  },

  caseParams(op) {
    if (!op.parameters || op.parameters.values().length === 0) {
      return ""
    }

    const { camelcase } = this.env.filters

    const res = op.parameters.values().map(p => {
      return `let ${camelcase(p.name)}`
    }).join(", ")

    return `(${res})`
  },

  modelParams(defn) {
    const { camelcase } = this.env.filters

    return _.map(defn.properties, (v, k) => {
      const fb = filters.defaultValue.call(this, v)

      if (fb != null) {
        return `${camelcase(k)}: ${filters.type.call(this, v)} = ${fb}`
      } else if (!v.isRequired()) {
        return `${camelcase(k)}: ${filters.type.call(this, v)}? = nil`
      } else {
        return `${camelcase(k)}: ${filters.type.call(this, v)}`
      }
    }).filter(x => x != null).join(", ")
  },

  modelCopyParams(defn) {
    const { camelcase } = this.env.filters

    return _.map(defn.properties, (v, k) => {
      //if (!v.isRequired()) {
        return `${camelcase(k)}: ${filters.type.call(this, v)}? = nil`//self.${camelcase(k)}`
      //}
      //return `${camelcase(k)}: ${filters.type.call(this, v)} = self.${camelcase(k)}`
    }).filter(x => x != null).join(", ")
  },

  modelCopyVals(defn) {
    const { camelcase } = this.env.filters

    return _.map(defn.properties, (v, k) => {
      return `${camelcase(k)}: ${camelcase(k)} ?? self.${camelcase(k)}`
    }).filter(x => x != null).join(", ")
  },

  url(op) {
    const vars = op.parameters.values()

    let url = op.url

    for (const v of vars) {
      const vn = filters.variable.call(this, v.name)

      if (v.format === "date-time") {
        url = url.replace(`{${v.name}}`, `\\(kernel.dateAsString(${vn}))`)
      } else {
        url = url.replace(`{${v.name}}`, `\\(${vn})`)
      }
    }

    return url
  },

  defaultValue(defn) {
    const v = defn.default

    if (v == null) {
      return
    }

    switch (defn.type) {
    case "string":
      return `"${v}"`
    case "array":
      return `[${v}]`
    default:
      return ""+v
    }
  },

  mapperFrom(defn, defnName) {
    const name = filters.variable.call(this, defnName)
    const type = filters.type.call(this, defn)
    const isRequired = defn.isRequired()
    const default_ = defn.default

    debug(defn)

    let hasTransformer = [
      //"Int32", "Int64"
      "WrappedDictionary"
    ].includes(type)

    let out = ""

    if (default_ == null && isRequired) {
      if (hasTransformer) {
        out = `try ${name} = map.from("${defnName}", transformation: transform${type})`
      } else {
        out = `try ${name} = map.from("${defnName}")`
      }
    } else {
      if (hasTransformer) {
        out = `${name} = map.optionalFrom("${defnName}", transformation: transform${type})`
      } else {
        out = `${name} = map.optionalFrom("${defnName}")`
      }

      if (default_ != null) {
        out += ` ?? ${filters.defaultValue.call(this, defn)}`
      }
    }

    return out
  }
}

module.exports = {
  filters
}
