export const sampleSchemas = {
    colors: `{
      "type": "object",
      "properties": {
        "colors": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "hex": { "type": "string" }
            }
          }
        }
      }
    }`,
  
    person: `{
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "number" },
        "hobbies": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }`
  };
  
  export const samplePrompts = {
    colors: "List 3 popular colors with their hex codes",
    person: "Create a profile for a fictional person named John"
  };