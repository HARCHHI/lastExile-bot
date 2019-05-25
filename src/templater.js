function templater(template, args) {
  const tags = template.match(/{{[^{}]*}}/g);

  if (tags === null) return template;

  return tags.reduce((result, tag) => {
    const argName = tag.replace(/^{{(.*)}}$/, '$1');

    result = result.replace(tag, args[argName]);
    return result;
  }, template);
}

module.exports = templater;
