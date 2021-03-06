import reduce from 'lodash/reduce';
import forEach from 'lodash/forEach';
import find from 'lodash/find';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import keys from 'lodash/keys';
import uniq from 'lodash/uniq';
import mapKeys from 'lodash/mapKeys';
import mapValues from 'lodash/mapValues';
import curry from 'lodash/curry';
import hogan from 'hogan.js';

export {
  getContainerNode,
  bemHelper,
  prepareTemplateProps,
  renderTemplate,
  isSpecialClick,
  isDomElement,
  getRefinements,
  clearRefinementsFromState,
  clearRefinementsAndSearch,
  prefixKeys,
  escapeRefinement,
  unescapeRefinement,
  checkRendering,
  isReactElement,
  deprecate,
};

/**
 * Return the container. If it's a string, it is considered a
 * css selector and retrieves the first matching element. Otherwise
 * test if it validates that it's a correct DOMElement.
 * @param {string|HTMLElement} selectorOrHTMLElement a selector or a node
 * @return {HTMLElement} The resolved HTMLElement
 * @throws Error when the type is not correct
 */
function getContainerNode(selectorOrHTMLElement) {
  const isFromString = typeof selectorOrHTMLElement === 'string';
  let domElement;
  if (isFromString) {
    domElement = document.querySelector(selectorOrHTMLElement);
  } else {
    domElement = selectorOrHTMLElement;
  }

  if (!isDomElement(domElement)) {
    let errorMessage = 'Container must be `string` or `HTMLElement`.';
    if (isFromString) {
      errorMessage += ` Unable to find ${selectorOrHTMLElement}`;
    }
    throw new Error(errorMessage);
  }

  return domElement;
}

/**
 * Returns true if the parameter is a DOMElement.
 * @param {any} o the value to test
 * @return {boolean} true if o is a DOMElement
 */
function isDomElement(o) {
  return o instanceof window.HTMLElement || (Boolean(o) && o.nodeType > 0);
}

function isSpecialClick(event) {
  const isMiddleClick = event.button === 1;
  return (
    isMiddleClick ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  );
}

/**
 * Creates BEM class name according the vanilla BEM style.
 * @param {string} block the main block
 * @return {function} function that takes up to 2 parameters
 * that determine the element and the modifier of the BEM class.
 */
function bemHelper(block) {
  return function(element, modifier) {
    // block--element
    if (element && !modifier) {
      return `${block}--${element}`;
    }
    // block--element__modifier
    if (element && modifier) {
      return `${block}--${element}__${modifier}`;
    }
    // block__modifier
    if (!element && modifier) {
      return `${block}__${modifier}`;
    }

    return block;
  };
}

/**
 * Prepares an object to be passed to the Template widget
 * @param {object} unknownBecauseES6 an object with the following attributes:
 *  - transformData
 *  - defaultTemplate
 *  - templates
 *  - templatesConfig
 * @return {object} the configuration with the attributes:
 *  - transformData
 *  - defaultTemplate
 *  - templates
 *  - useCustomCompileOptions
 */
function prepareTemplateProps({
  transformData,
  defaultTemplates,
  templates,
  templatesConfig,
}) {
  const preparedTemplates = prepareTemplates(defaultTemplates, templates);

  return {
    transformData,
    templatesConfig,
    ...preparedTemplates,
  };
}

function prepareTemplates(defaultTemplates = {}, templates = {}) {
  const allKeys = uniq([...keys(defaultTemplates), ...keys(templates)]);

  return reduce(
    allKeys,
    (config, key) => {
      const defaultTemplate = defaultTemplates[key];
      const customTemplate = templates[key];
      const isCustomTemplate =
        customTemplate !== undefined && customTemplate !== defaultTemplate;

      config.templates[key] = isCustomTemplate
        ? customTemplate
        : defaultTemplate;
      config.useCustomCompileOptions[key] = isCustomTemplate;

      return config;
    },
    { templates: {}, useCustomCompileOptions: {} }
  );
}

function renderTemplate({
  templates,
  templateKey,
  compileOptions,
  helpers,
  data,
}) {
  const template = templates[templateKey];
  const templateType = typeof template;
  const isTemplateString = templateType === 'string';
  const isTemplateFunction = templateType === 'function';

  if (!isTemplateString && !isTemplateFunction) {
    throw new Error(
      `Template must be 'string' or 'function', was '${templateType}' (key: ${templateKey})`
    );
  }

  if (isTemplateFunction) {
    return template(data);
  }

  const transformedHelpers = transformHelpersToHogan(
    helpers,
    compileOptions,
    data
  );

  return hogan.compile(template, compileOptions).render({
    ...data,
    helpers: transformedHelpers,
  });
}

// We add all our template helper methods to the template as lambdas. Note
// that lambdas in Mustache are supposed to accept a second argument of
// `render` to get the rendered value, not the literal `{{value}}`. But
// this is currently broken (see https://github.com/twitter/hogan.js/issues/222).
function transformHelpersToHogan(helpers, compileOptions, data) {
  return mapValues(helpers, method =>
    curry(function(text) {
      const render = value => hogan.compile(value, compileOptions).render(this);
      return method.call(data, text, render);
    })
  );
}

function getRefinement(state, type, attributeName, name, resultsFacets) {
  const res = { type, attributeName, name };
  let facet = find(resultsFacets, { name: attributeName });
  let count;
  if (type === 'hierarchical') {
    const facetDeclaration = state.getHierarchicalFacetByName(attributeName);
    const split = name.split(facetDeclaration.separator);
    res.name = split[split.length - 1];
    for (let i = 0; facet !== undefined && i < split.length; ++i) {
      facet = find(facet.data, { name: split[i] });
    }
    count = get(facet, 'count');
  } else {
    count = get(facet, `data["${res.name}"]`);
  }
  const exhaustive = get(facet, 'exhaustive');
  if (count !== undefined) {
    res.count = count;
  }
  if (exhaustive !== undefined) {
    res.exhaustive = exhaustive;
  }
  return res;
}

function getRefinements(results, state, clearsQuery) {
  const res =
    clearsQuery && state.query && state.query.trim()
      ? [
          {
            type: 'query',
            name: state.query,
            query: state.query,
          },
        ]
      : [];

  forEach(state.facetsRefinements, (refinements, attributeName) => {
    forEach(refinements, name => {
      res.push(
        getRefinement(state, 'facet', attributeName, name, results.facets)
      );
    });
  });

  forEach(state.facetsExcludes, (refinements, attributeName) => {
    forEach(refinements, name => {
      res.push({ type: 'exclude', attributeName, name, exclude: true });
    });
  });

  forEach(state.disjunctiveFacetsRefinements, (refinements, attributeName) => {
    forEach(refinements, name => {
      res.push(
        getRefinement(
          state,
          'disjunctive',
          attributeName,
          // we unescapeRefinement any disjunctive refined value since they can be escaped
          // when negative numeric values search `escapeRefinement` usage in code
          unescapeRefinement(name),
          results.disjunctiveFacets
        )
      );
    });
  });

  forEach(state.hierarchicalFacetsRefinements, (refinements, attributeName) => {
    forEach(refinements, name => {
      res.push(
        getRefinement(
          state,
          'hierarchical',
          attributeName,
          name,
          results.hierarchicalFacets
        )
      );
    });
  });

  forEach(state.numericRefinements, (operators, attributeName) => {
    forEach(operators, (values, operator) => {
      forEach(values, value => {
        res.push({
          type: 'numeric',
          attributeName,
          name: `${value}`,
          numericValue: value,
          operator,
        });
      });
    });
  });

  forEach(state.tagRefinements, name => {
    res.push({ type: 'tag', attributeName: '_tags', name });
  });

  return res;
}

function clearRefinementsFromState(
  inputState,
  attributeNames,
  clearsQuery = false
) {
  let state = inputState;

  if (clearsQuery) {
    state = state.setQuery('');
  }

  if (isEmpty(attributeNames)) {
    state = state.clearTags();
    state = state.clearRefinements();
    return state;
  }

  forEach(attributeNames, attributeName => {
    if (attributeName === '_tags') {
      state = state.clearTags();
    } else {
      state = state.clearRefinements(attributeName);
    }
  });

  return state;
}

function clearRefinementsAndSearch(
  helper,
  attributeNames,
  clearsQuery = false
) {
  helper
    .setState(
      clearRefinementsFromState(helper.state, attributeNames, clearsQuery)
    )
    .search();
}

function prefixKeys(prefix, obj) {
  if (obj) {
    return mapKeys(obj, (v, k) => prefix + k);
  }

  return undefined;
}

function escapeRefinement(value) {
  if (typeof value === 'number' && value < 0) {
    value = String(value).replace(/^-/, '\\-');
  }

  return value;
}

function unescapeRefinement(value) {
  return String(value).replace(/^\\-/, '-');
}

function checkRendering(rendering, usage) {
  if (rendering === undefined || typeof rendering !== 'function') {
    throw new Error(usage);
  }
}

const REACT_ELEMENT_TYPE =
  (typeof Symbol === 'function' && Symbol.for && Symbol.for('react.element')) ||
  0xeac7;

function isReactElement(object) {
  return (
    typeof object === 'object' &&
    object !== null &&
    object.$$typeof === REACT_ELEMENT_TYPE
  );
}

function deprecate(fn, message) {
  let hasAlreadyPrint = false;

  return function(...args) {
    if (!hasAlreadyPrint) {
      hasAlreadyPrint = true;

      // eslint-disable-next-line no-console
      console.warn(`[InstantSearch.js]: ${message}`);
    }

    return fn(...args);
  };
}
