var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../parity/proj/node_modules/react/cjs/react.production.js
var require_react_production = __commonJS({
  "../parity/proj/node_modules/react/cjs/react.production.js"(exports) {
    "use strict";
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
    var REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer");
    var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
    var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
    var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
    var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
    var REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity");
    var REACT_VIEW_TRANSITION_TYPE = /* @__PURE__ */ Symbol.for("react.view_transition");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var ReactNoopUpdateQueue = {
      isMounted: function() {
        return false;
      },
      enqueueForceUpdate: function() {
      },
      enqueueReplaceState: function() {
      },
      enqueueSetState: function() {
      }
    };
    var assign = Object.assign;
    var emptyObject = {};
    function Component(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    Component.prototype.isReactComponent = {};
    Component.prototype.setState = function(partialState, callback) {
      if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
        throw Error(
          "takes an object of state variables to update or a function which returns an object of state variables."
        );
      this.updater.enqueueSetState(this, partialState, callback, "setState");
    };
    Component.prototype.forceUpdate = function(callback) {
      this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
    };
    function ComponentDummy() {
    }
    ComponentDummy.prototype = Component.prototype;
    function PureComponent(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
    pureComponentPrototype.constructor = PureComponent;
    assign(pureComponentPrototype, Component.prototype);
    pureComponentPrototype.isPureReactComponent = true;
    var isArrayImpl = Array.isArray;
    function noop2() {
    }
    var ReactSharedInternals = { H: null, A: null, T: null, S: null };
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function ReactElement(type, key2, props) {
      var refProp = props.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key: key2,
        ref: void 0 !== refProp ? refProp : null,
        props
      };
    }
    function cloneAndReplaceKey(oldElement, newKey) {
      return ReactElement(oldElement.type, newKey, oldElement.props);
    }
    function isValidElement(object) {
      return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    function escape(key2) {
      var escaperLookup = { "=": "=0", ":": "=2" };
      return "$" + key2.replace(/[=:]/g, function(match) {
        return escaperLookup[match];
      });
    }
    var userProvidedKeyEscapeRegex = /\/+/g;
    function getElementKey(element, index) {
      return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
    }
    function resolveThenable(thenable) {
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
        default:
          switch ("string" === typeof thenable.status ? thenable.then(noop2, noop2) : (thenable.status = "pending", thenable.then(
            function(fulfilledValue) {
              "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
            },
            function(error) {
              "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
            }
          )), thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenable.reason;
          }
      }
      throw thenable;
    }
    function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
      var type = typeof children;
      if ("undefined" === type || "boolean" === type) children = null;
      var invokeCallback = false;
      if (null === children) invokeCallback = true;
      else
        switch (type) {
          case "bigint":
          case "string":
          case "number":
            invokeCallback = true;
            break;
          case "object":
            switch (children.$$typeof) {
              case REACT_ELEMENT_TYPE:
              case REACT_PORTAL_TYPE:
                invokeCallback = true;
                break;
              case REACT_LAZY_TYPE:
                return invokeCallback = children._init, mapIntoArray(
                  invokeCallback(children._payload),
                  array,
                  escapedPrefix,
                  nameSoFar,
                  callback
                );
            }
        }
      if (invokeCallback)
        return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
          return c;
        })) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(
          callback,
          escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(
            userProvidedKeyEscapeRegex,
            "$&/"
          ) + "/") + invokeCallback
        )), array.push(callback)), 1;
      invokeCallback = 0;
      var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
      if (isArrayImpl(children))
        for (var i = 0; i < children.length; i++)
          nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if (i = getIteratorFn(children), "function" === typeof i)
        for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
          nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if ("object" === type) {
        if ("function" === typeof children.then)
          return mapIntoArray(
            resolveThenable(children),
            array,
            escapedPrefix,
            nameSoFar,
            callback
          );
        array = String(children);
        throw Error(
          "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
        );
      }
      return invokeCallback;
    }
    function mapChildren(children, func, context) {
      if (null == children) return children;
      var result = [], count = 0;
      mapIntoArray(children, result, "", "", function(child) {
        return func.call(context, child, count++);
      });
      return result;
    }
    function lazyInitializer(payload) {
      if (-1 === payload._status) {
        var ctor = payload._result, thenable = ctor();
        thenable.then(
          function(moduleObject) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 1, payload._result = moduleObject, void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
          },
          function(error) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 2, payload._result = error, void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
          }
        );
        -1 === payload._status && (payload._status = 0, payload._result = thenable);
      }
      if (1 === payload._status) return payload._result.default;
      throw payload._result;
    }
    var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
      if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event)) return;
      } else if ("object" === typeof process && "function" === typeof process.emit) {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    };
    function startTransition(scope) {
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      currentTransition.types = null !== prevTransition ? prevTransition.types : null;
      ReactSharedInternals.T = currentTransition;
      try {
        var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop2, reportGlobalError);
      } catch (error) {
        reportGlobalError(error);
      } finally {
        null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
      }
    }
    function addTransitionType(type) {
      var transition = ReactSharedInternals.T;
      if (null !== transition) {
        var transitionTypes = transition.types;
        null === transitionTypes ? transition.types = [type] : -1 === transitionTypes.indexOf(type) && transitionTypes.push(type);
      } else startTransition(addTransitionType.bind(null, type));
    }
    var Children = {
      map: mapChildren,
      forEach: function(children, forEachFunc, forEachContext) {
        mapChildren(
          children,
          function() {
            forEachFunc.apply(this, arguments);
          },
          forEachContext
        );
      },
      count: function(children) {
        var n = 0;
        mapChildren(children, function() {
          n++;
        });
        return n;
      },
      toArray: function(children) {
        return mapChildren(children, function(child) {
          return child;
        }) || [];
      },
      only: function(children) {
        if (!isValidElement(children))
          throw Error(
            "React.Children.only expected to receive a single React element child."
          );
        return children;
      }
    };
    exports.Activity = REACT_ACTIVITY_TYPE;
    exports.Children = Children;
    exports.Component = Component;
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.Profiler = REACT_PROFILER_TYPE;
    exports.PureComponent = PureComponent;
    exports.StrictMode = REACT_STRICT_MODE_TYPE;
    exports.Suspense = REACT_SUSPENSE_TYPE;
    exports.ViewTransition = REACT_VIEW_TRANSITION_TYPE;
    exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
    exports.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function(size) {
        return ReactSharedInternals.H.useMemoCache(size);
      }
    };
    exports.addTransitionType = addTransitionType;
    exports.cache = function(fn) {
      return function() {
        return fn.apply(null, arguments);
      };
    };
    exports.cacheSignal = function() {
      return null;
    };
    exports.cloneElement = function(element, config2, children) {
      if (null === element || void 0 === element)
        throw Error(
          "The argument must be a React element, but you passed " + element + "."
        );
      var props = assign({}, element.props), key2 = element.key;
      if (null != config2)
        for (propName in void 0 !== config2.key && (key2 = "" + config2.key), config2)
          !hasOwnProperty.call(config2, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config2.ref || (props[propName] = config2[propName]);
      var propName = arguments.length - 2;
      if (1 === propName) props.children = children;
      else if (1 < propName) {
        for (var childArray = Array(propName), i = 0; i < propName; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      return ReactElement(element.type, key2, props);
    };
    exports.createContext = function(defaultValue) {
      defaultValue = {
        $$typeof: REACT_CONTEXT_TYPE,
        _currentValue: defaultValue,
        _currentValue2: defaultValue,
        _threadCount: 0,
        Provider: null,
        Consumer: null
      };
      defaultValue.Provider = defaultValue;
      defaultValue.Consumer = {
        $$typeof: REACT_CONSUMER_TYPE,
        _context: defaultValue
      };
      return defaultValue;
    };
    exports.createElement = function(type, config2, children) {
      var propName, props = {}, key2 = null;
      if (null != config2)
        for (propName in void 0 !== config2.key && (key2 = "" + config2.key), config2)
          hasOwnProperty.call(config2, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config2[propName]);
      var childrenLength = arguments.length - 2;
      if (1 === childrenLength) props.children = children;
      else if (1 < childrenLength) {
        for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      if (type && type.defaultProps)
        for (propName in childrenLength = type.defaultProps, childrenLength)
          void 0 === props[propName] && (props[propName] = childrenLength[propName]);
      return ReactElement(type, key2, props);
    };
    exports.createRef = function() {
      return { current: null };
    };
    exports.forwardRef = function(render) {
      return { $$typeof: REACT_FORWARD_REF_TYPE, render };
    };
    exports.isValidElement = isValidElement;
    exports.lazy = function(ctor) {
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: { _status: -1, _result: ctor },
        _init: lazyInitializer
      };
    };
    exports.memo = function(type, compare) {
      return {
        $$typeof: REACT_MEMO_TYPE,
        type,
        compare: void 0 === compare ? null : compare
      };
    };
    exports.startTransition = startTransition;
    exports.unstable_useCacheRefresh = function() {
      return ReactSharedInternals.H.useCacheRefresh();
    };
    exports.use = function(usable) {
      return ReactSharedInternals.H.use(usable);
    };
    exports.useActionState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useActionState(action, initialState, permalink);
    };
    exports.useCallback = function(callback, deps) {
      return ReactSharedInternals.H.useCallback(callback, deps);
    };
    exports.useContext = function(Context) {
      return ReactSharedInternals.H.useContext(Context);
    };
    exports.useDebugValue = function() {
    };
    exports.useDeferredValue = function(value, initialValue) {
      return ReactSharedInternals.H.useDeferredValue(value, initialValue);
    };
    exports.useEffect = function(create, deps) {
      return ReactSharedInternals.H.useEffect(create, deps);
    };
    exports.useEffectEvent = function(callback) {
      return ReactSharedInternals.H.useEffectEvent(callback);
    };
    exports.useId = function() {
      return ReactSharedInternals.H.useId();
    };
    exports.useImperativeHandle = function(ref, create, deps) {
      return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
    };
    exports.useInsertionEffect = function(create, deps) {
      return ReactSharedInternals.H.useInsertionEffect(create, deps);
    };
    exports.useLayoutEffect = function(create, deps) {
      return ReactSharedInternals.H.useLayoutEffect(create, deps);
    };
    exports.useMemo = function(create, deps) {
      return ReactSharedInternals.H.useMemo(create, deps);
    };
    exports.useOptimistic = function(passthrough, reducer) {
      return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
    };
    exports.useReducer = function(reducer, initialArg, init) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
    };
    exports.useRef = function(initialValue) {
      return ReactSharedInternals.H.useRef(initialValue);
    };
    exports.useState = function(initialState) {
      return ReactSharedInternals.H.useState(initialState);
    };
    exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
      return ReactSharedInternals.H.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
    };
    exports.useTransition = function() {
      return ReactSharedInternals.H.useTransition();
    };
    exports.version = "19.3.1";
  }
});

// ../parity/proj/node_modules/react/index.js
var require_react = __commonJS({
  "../parity/proj/node_modules/react/index.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_react_production();
    } else {
      module.exports = null;
    }
  }
});

// ../parity/proj/node_modules/scheduler/cjs/scheduler.production.js
var require_scheduler_production = __commonJS({
  "../parity/proj/node_modules/scheduler/cjs/scheduler.production.js"(exports) {
    "use strict";
    function push(heap, node) {
      var index = heap.length;
      heap.push(node);
      a: for (; 0 < index; ) {
        var parentIndex = index - 1 >>> 1, parent = heap[parentIndex];
        if (0 < compare(parent, node))
          heap[parentIndex] = node, heap[index] = parent, index = parentIndex;
        else break a;
      }
    }
    function peek(heap) {
      return 0 === heap.length ? null : heap[0];
    }
    function pop(heap) {
      if (0 === heap.length) return null;
      var first = heap[0], last = heap.pop();
      if (last !== first) {
        heap[0] = last;
        a: for (var index = 0, length = heap.length, halfLength = length >>> 1; index < halfLength; ) {
          var leftIndex = 2 * (index + 1) - 1, left = heap[leftIndex], rightIndex = leftIndex + 1, right2 = heap[rightIndex];
          if (0 > compare(left, last))
            rightIndex < length && 0 > compare(right2, left) ? (heap[index] = right2, heap[rightIndex] = last, index = rightIndex) : (heap[index] = left, heap[leftIndex] = last, index = leftIndex);
          else if (rightIndex < length && 0 > compare(right2, last))
            heap[index] = right2, heap[rightIndex] = last, index = rightIndex;
          else break a;
        }
      }
      return first;
    }
    function compare(a, b) {
      var diff = a.sortIndex - b.sortIndex;
      return 0 !== diff ? diff : a.id - b.id;
    }
    exports.unstable_now = void 0;
    if ("object" === typeof performance && "function" === typeof performance.now) {
      localPerformance = performance;
      exports.unstable_now = function() {
        return localPerformance.now();
      };
    } else {
      localDate = Date, initialTime = localDate.now();
      exports.unstable_now = function() {
        return localDate.now() - initialTime;
      };
    }
    var localPerformance;
    var localDate;
    var initialTime;
    var taskQueue = [];
    var timerQueue = [];
    var taskIdCounter = 1;
    var currentTask = null;
    var currentPriorityLevel = 3;
    var isPerformingWork = false;
    var isHostCallbackScheduled = false;
    var isHostTimeoutScheduled = false;
    var needsPaint = false;
    var localSetTimeout = "function" === typeof setTimeout ? setTimeout : null;
    var localClearTimeout = "function" === typeof clearTimeout ? clearTimeout : null;
    var localSetImmediate = "undefined" !== typeof setImmediate ? setImmediate : null;
    function advanceTimers(currentTime) {
      for (var timer = peek(timerQueue); null !== timer; ) {
        if (null === timer.callback) pop(timerQueue);
        else if (timer.startTime <= currentTime)
          pop(timerQueue), timer.sortIndex = timer.expirationTime, push(taskQueue, timer);
        else break;
        timer = peek(timerQueue);
      }
    }
    function handleTimeout(currentTime) {
      isHostTimeoutScheduled = false;
      advanceTimers(currentTime);
      if (!isHostCallbackScheduled)
        if (null !== peek(taskQueue))
          isHostCallbackScheduled = true, isMessageLoopRunning || (isMessageLoopRunning = true, schedulePerformWorkUntilDeadline());
        else {
          var firstTimer = peek(timerQueue);
          null !== firstTimer && requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
        }
    }
    var isMessageLoopRunning = false;
    var taskTimeoutID = -1;
    var frameInterval = 5;
    var startTime = -1;
    function shouldYieldToHost() {
      return needsPaint ? true : exports.unstable_now() - startTime < frameInterval ? false : true;
    }
    function performWorkUntilDeadline() {
      needsPaint = false;
      if (isMessageLoopRunning) {
        var currentTime = exports.unstable_now();
        startTime = currentTime;
        var hasMoreWork = true;
        try {
          a: {
            isHostCallbackScheduled = false;
            isHostTimeoutScheduled && (isHostTimeoutScheduled = false, localClearTimeout(taskTimeoutID), taskTimeoutID = -1);
            isPerformingWork = true;
            var previousPriorityLevel = currentPriorityLevel;
            try {
              b: {
                advanceTimers(currentTime);
                for (currentTask = peek(taskQueue); null !== currentTask && !(currentTask.expirationTime > currentTime && shouldYieldToHost()); ) {
                  var callback = currentTask.callback;
                  if ("function" === typeof callback) {
                    currentTask.callback = null;
                    currentPriorityLevel = currentTask.priorityLevel;
                    var continuationCallback = callback(
                      currentTask.expirationTime <= currentTime
                    );
                    currentTime = exports.unstable_now();
                    if ("function" === typeof continuationCallback) {
                      currentTask.callback = continuationCallback;
                      advanceTimers(currentTime);
                      hasMoreWork = true;
                      break b;
                    }
                    currentTask === peek(taskQueue) && pop(taskQueue);
                    advanceTimers(currentTime);
                  } else pop(taskQueue);
                  currentTask = peek(taskQueue);
                }
                if (null !== currentTask) hasMoreWork = true;
                else {
                  var firstTimer = peek(timerQueue);
                  null !== firstTimer && requestHostTimeout(
                    handleTimeout,
                    firstTimer.startTime - currentTime
                  );
                  hasMoreWork = false;
                }
              }
              break a;
            } finally {
              currentTask = null, currentPriorityLevel = previousPriorityLevel, isPerformingWork = false;
            }
            hasMoreWork = void 0;
          }
        } finally {
          hasMoreWork ? schedulePerformWorkUntilDeadline() : isMessageLoopRunning = false;
        }
      }
    }
    var schedulePerformWorkUntilDeadline;
    if ("function" === typeof localSetImmediate)
      schedulePerformWorkUntilDeadline = function() {
        localSetImmediate(performWorkUntilDeadline);
      };
    else if ("undefined" !== typeof MessageChannel) {
      channel = new MessageChannel(), port = channel.port2;
      channel.port1.onmessage = performWorkUntilDeadline;
      schedulePerformWorkUntilDeadline = function() {
        port.postMessage(null);
      };
    } else
      schedulePerformWorkUntilDeadline = function() {
        localSetTimeout(performWorkUntilDeadline, 0);
      };
    var channel;
    var port;
    function requestHostTimeout(callback, ms) {
      taskTimeoutID = localSetTimeout(function() {
        callback(exports.unstable_now());
      }, ms);
    }
    exports.unstable_IdlePriority = 5;
    exports.unstable_ImmediatePriority = 1;
    exports.unstable_LowPriority = 4;
    exports.unstable_NormalPriority = 3;
    exports.unstable_Profiling = null;
    exports.unstable_UserBlockingPriority = 2;
    exports.unstable_cancelCallback = function(task) {
      task.callback = null;
    };
    exports.unstable_forceFrameRate = function(fps) {
      0 > fps || 125 < fps ? console.error(
        "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
      ) : frameInterval = 0 < fps ? Math.floor(1e3 / fps) : 5;
    };
    exports.unstable_getCurrentPriorityLevel = function() {
      return currentPriorityLevel;
    };
    exports.unstable_next = function(eventHandler) {
      switch (currentPriorityLevel) {
        case 1:
        case 2:
        case 3:
          var priorityLevel = 3;
          break;
        default:
          priorityLevel = currentPriorityLevel;
      }
      var previousPriorityLevel = currentPriorityLevel;
      currentPriorityLevel = priorityLevel;
      try {
        return eventHandler();
      } finally {
        currentPriorityLevel = previousPriorityLevel;
      }
    };
    exports.unstable_requestPaint = function() {
      needsPaint = true;
    };
    exports.unstable_runWithPriority = function(priorityLevel, eventHandler) {
      switch (priorityLevel) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          priorityLevel = 3;
      }
      var previousPriorityLevel = currentPriorityLevel;
      currentPriorityLevel = priorityLevel;
      try {
        return eventHandler();
      } finally {
        currentPriorityLevel = previousPriorityLevel;
      }
    };
    exports.unstable_scheduleCallback = function(priorityLevel, callback, options) {
      var currentTime = exports.unstable_now();
      "object" === typeof options && null !== options ? (options = options.delay, options = "number" === typeof options && 0 < options ? currentTime + options : currentTime) : options = currentTime;
      switch (priorityLevel) {
        case 1:
          var timeout = -1;
          break;
        case 2:
          timeout = 250;
          break;
        case 5:
          timeout = 1073741823;
          break;
        case 4:
          timeout = 1e4;
          break;
        default:
          timeout = 5e3;
      }
      timeout = options + timeout;
      priorityLevel = {
        id: taskIdCounter++,
        callback,
        priorityLevel,
        startTime: options,
        expirationTime: timeout,
        sortIndex: -1
      };
      options > currentTime ? (priorityLevel.sortIndex = options, push(timerQueue, priorityLevel), null === peek(taskQueue) && priorityLevel === peek(timerQueue) && (isHostTimeoutScheduled ? (localClearTimeout(taskTimeoutID), taskTimeoutID = -1) : isHostTimeoutScheduled = true, requestHostTimeout(handleTimeout, options - currentTime))) : (priorityLevel.sortIndex = timeout, push(taskQueue, priorityLevel), isHostCallbackScheduled || isPerformingWork || (isHostCallbackScheduled = true, isMessageLoopRunning || (isMessageLoopRunning = true, schedulePerformWorkUntilDeadline())));
      return priorityLevel;
    };
    exports.unstable_shouldYield = shouldYieldToHost;
    exports.unstable_wrapCallback = function(callback) {
      var parentPriorityLevel = currentPriorityLevel;
      return function() {
        var previousPriorityLevel = currentPriorityLevel;
        currentPriorityLevel = parentPriorityLevel;
        try {
          return callback.apply(this, arguments);
        } finally {
          currentPriorityLevel = previousPriorityLevel;
        }
      };
    };
  }
});

// ../parity/proj/node_modules/scheduler/index.js
var require_scheduler = __commonJS({
  "../parity/proj/node_modules/scheduler/index.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_scheduler_production();
    } else {
      module.exports = null;
    }
  }
});

// ../parity/proj/node_modules/react-dom/cjs/react-dom.production.js
var require_react_dom_production = __commonJS({
  "../parity/proj/node_modules/react-dom/cjs/react-dom.production.js"(exports) {
    "use strict";
    var React9 = require_react();
    function formatProdErrorMessage(code) {
      var url = "https://react.dev/errors/" + code;
      if (1 < arguments.length) {
        url += "?args[]=" + encodeURIComponent(arguments[1]);
        for (var i = 2; i < arguments.length; i++)
          url += "&args[]=" + encodeURIComponent(arguments[i]);
      }
      return "Minified React error #" + code + "; visit " + url + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
    }
    function noop2() {
    }
    var Internals = {
      d: {
        f: noop2,
        r: function() {
          throw Error(formatProdErrorMessage(522));
        },
        D: noop2,
        C: noop2,
        L: noop2,
        m: noop2,
        X: noop2,
        S: noop2,
        M: noop2
      },
      p: 0,
      findDOMNode: null
    };
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    var REACT_RECOVERABLE_TYPE = /* @__PURE__ */ Symbol.for("react.recoverable");
    var REACT_OPTIMISTIC_KEY = /* @__PURE__ */ Symbol.for("react.optimistic_key");
    function createPortal$1(children, containerInfo, implementation) {
      var key2 = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
      return {
        $$typeof: REACT_PORTAL_TYPE,
        key: null == key2 ? null : key2 === REACT_OPTIMISTIC_KEY ? REACT_OPTIMISTIC_KEY : "" + key2,
        children,
        containerInfo,
        implementation
      };
    }
    var ReactSharedInternals = React9.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    function getCrossOriginStringAs(as, input) {
      if ("font" === as) return "";
      if ("string" === typeof input)
        return "use-credentials" === input ? input : "";
    }
    exports.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Internals;
    exports.browser = function(reason) {
      return { $$typeof: REACT_RECOVERABLE_TYPE, _reason: reason };
    };
    exports.createPortal = function(children, container) {
      var key2 = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
      if (!container || 1 !== container.nodeType && 9 !== container.nodeType && 11 !== container.nodeType)
        throw Error(formatProdErrorMessage(299));
      return createPortal$1(children, container, null, key2);
    };
    exports.flushSync = function(fn) {
      var previousTransition = ReactSharedInternals.T, previousUpdatePriority = Internals.p;
      try {
        if (ReactSharedInternals.T = null, Internals.p = 2, fn) return fn();
      } finally {
        ReactSharedInternals.T = previousTransition, Internals.p = previousUpdatePriority, Internals.d.f();
      }
    };
    exports.preconnect = function(href, options) {
      "string" === typeof href && (options ? (options = options.crossOrigin, options = "string" === typeof options ? "use-credentials" === options ? options : "" : void 0) : options = null, Internals.d.C(href, options));
    };
    exports.prefetchDNS = function(href) {
      "string" === typeof href && Internals.d.D(href);
    };
    exports.preinit = function(href, options) {
      if ("string" === typeof href && options && "string" === typeof options.as) {
        var as = options.as, crossOrigin = getCrossOriginStringAs(as, options.crossOrigin), integrity = "string" === typeof options.integrity ? options.integrity : void 0, fetchPriority = "string" === typeof options.fetchPriority ? options.fetchPriority : void 0;
        "style" === as ? Internals.d.S(
          href,
          "string" === typeof options.precedence ? options.precedence : void 0,
          {
            crossOrigin,
            integrity,
            fetchPriority
          }
        ) : "script" === as && Internals.d.X(href, {
          crossOrigin,
          integrity,
          fetchPriority,
          nonce: "string" === typeof options.nonce ? options.nonce : void 0
        });
      }
    };
    exports.preinitModule = function(href, options) {
      if ("string" === typeof href)
        if ("object" === typeof options && null !== options) {
          if (null == options.as || "script" === options.as) {
            var crossOrigin = getCrossOriginStringAs(
              options.as,
              options.crossOrigin
            );
            Internals.d.M(href, {
              crossOrigin,
              integrity: "string" === typeof options.integrity ? options.integrity : void 0,
              nonce: "string" === typeof options.nonce ? options.nonce : void 0,
              fetchPriority: "string" === typeof options.fetchPriority ? options.fetchPriority : void 0
            });
          }
        } else null == options && Internals.d.M(href);
    };
    exports.preload = function(href, options) {
      if ("string" === typeof href && "object" === typeof options && null !== options && "string" === typeof options.as) {
        var as = options.as, crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
        Internals.d.L(href, as, {
          crossOrigin,
          integrity: "string" === typeof options.integrity ? options.integrity : void 0,
          nonce: "string" === typeof options.nonce ? options.nonce : void 0,
          type: "string" === typeof options.type ? options.type : void 0,
          fetchPriority: "string" === typeof options.fetchPriority ? options.fetchPriority : void 0,
          referrerPolicy: "string" === typeof options.referrerPolicy ? options.referrerPolicy : void 0,
          imageSrcSet: "string" === typeof options.imageSrcSet ? options.imageSrcSet : void 0,
          imageSizes: "string" === typeof options.imageSizes ? options.imageSizes : void 0,
          media: "string" === typeof options.media ? options.media : void 0
        });
      }
    };
    exports.preloadModule = function(href, options) {
      if ("string" === typeof href)
        if (options) {
          var crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
          Internals.d.m(href, {
            as: "string" === typeof options.as && "script" !== options.as ? options.as : void 0,
            crossOrigin,
            integrity: "string" === typeof options.integrity ? options.integrity : void 0,
            nonce: "string" === typeof options.nonce ? options.nonce : void 0,
            fetchPriority: "string" === typeof options.fetchPriority ? options.fetchPriority : void 0
          });
        } else Internals.d.m(href);
    };
    exports.requestFormReset = function(form) {
      Internals.d.r(form);
    };
    exports.unstable_batchedUpdates = function(fn, a) {
      return fn(a);
    };
    exports.useFormState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useFormState(action, initialState, permalink);
    };
    exports.useFormStatus = function() {
      return ReactSharedInternals.H.useHostTransitionStatus();
    };
    exports.version = "19.3.1";
  }
});

// ../parity/proj/node_modules/react-dom/index.js
var require_react_dom = __commonJS({
  "../parity/proj/node_modules/react-dom/index.js"(exports, module) {
    "use strict";
    function checkDCE() {
      if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
        return;
      }
      if (false) {
        throw new Error("^_^");
      }
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
      } catch (err) {
        console.error(err);
      }
    }
    if (true) {
      checkDCE();
      module.exports = require_react_dom_production();
    } else {
      module.exports = null;
    }
  }
});

// ../parity/proj/node_modules/react-dom/cjs/react-dom-client.production.js
var require_react_dom_client_production = __commonJS({
  "../parity/proj/node_modules/react-dom/cjs/react-dom-client.production.js"(exports) {
    "use strict";
    var Scheduler = require_scheduler();
    var React9 = require_react();
    var ReactDOM2 = require_react_dom();
    function formatProdErrorMessage(code) {
      var url = "https://react.dev/errors/" + code;
      if (1 < arguments.length) {
        url += "?args[]=" + encodeURIComponent(arguments[1]);
        for (var i = 2; i < arguments.length; i++)
          url += "&args[]=" + encodeURIComponent(arguments[i]);
      }
      return "Minified React error #" + code + "; visit " + url + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
    }
    function isValidContainer(node) {
      return !(!node || 1 !== node.nodeType && 9 !== node.nodeType && 11 !== node.nodeType);
    }
    function getNearestMountedFiber(fiber) {
      for (var node = fiber, nextNode = node; nextNode && !nextNode.alternate; )
        node = nextNode, 0 !== (node.flags & 4098) && (fiber = node.return), nextNode = node.return;
      for (; node.return; ) node = node.return;
      return 3 === node.tag ? fiber : null;
    }
    function getSuspenseInstanceFromFiber(fiber) {
      if (13 === fiber.tag) {
        var suspenseState = fiber.memoizedState;
        null === suspenseState && (fiber = fiber.alternate, null !== fiber && (suspenseState = fiber.memoizedState));
        if (null !== suspenseState) return suspenseState.dehydrated;
      }
      return null;
    }
    function getActivityInstanceFromFiber(fiber) {
      if (31 === fiber.tag) {
        var activityState = fiber.memoizedState;
        null === activityState && (fiber = fiber.alternate, null !== fiber && (activityState = fiber.memoizedState));
        if (null !== activityState) return activityState.dehydrated;
      }
      return null;
    }
    function assertIsMounted(fiber) {
      if (getNearestMountedFiber(fiber) !== fiber)
        throw Error(formatProdErrorMessage(188));
    }
    function findCurrentFiberUsingSlowPath(fiber) {
      var alternate = fiber.alternate;
      if (!alternate) {
        alternate = getNearestMountedFiber(fiber);
        if (null === alternate) throw Error(formatProdErrorMessage(188));
        return alternate !== fiber ? null : fiber;
      }
      for (var a = fiber, b = alternate; ; ) {
        var parentA = a.return;
        if (null === parentA) break;
        var parentB = parentA.alternate;
        if (null === parentB) {
          b = parentA.return;
          if (null !== b) {
            a = b;
            continue;
          }
          break;
        }
        if (parentA.child === parentB.child) {
          for (parentB = parentA.child; parentB; ) {
            if (parentB === a) return assertIsMounted(parentA), fiber;
            if (parentB === b) return assertIsMounted(parentA), alternate;
            parentB = parentB.sibling;
          }
          throw Error(formatProdErrorMessage(188));
        }
        if (a.return !== b.return) a = parentA, b = parentB;
        else {
          for (var didFindChild = false, child$0 = parentA.child; child$0; ) {
            if (child$0 === a) {
              didFindChild = true;
              a = parentA;
              b = parentB;
              break;
            }
            if (child$0 === b) {
              didFindChild = true;
              b = parentA;
              a = parentB;
              break;
            }
            child$0 = child$0.sibling;
          }
          if (!didFindChild) {
            for (child$0 = parentB.child; child$0; ) {
              if (child$0 === a) {
                didFindChild = true;
                a = parentB;
                b = parentA;
                break;
              }
              if (child$0 === b) {
                didFindChild = true;
                b = parentB;
                a = parentA;
                break;
              }
              child$0 = child$0.sibling;
            }
            if (!didFindChild) throw Error(formatProdErrorMessage(189));
          }
        }
        if (a.alternate !== b) throw Error(formatProdErrorMessage(190));
      }
      if (3 !== a.tag) throw Error(formatProdErrorMessage(188));
      return a.stateNode.current === a ? fiber : alternate;
    }
    function findCurrentHostFiberImpl(node) {
      var tag = node.tag;
      if (5 === tag || 26 === tag || 27 === tag || 6 === tag) return node;
      for (node = node.child; null !== node; ) {
        tag = findCurrentHostFiberImpl(node);
        if (null !== tag) return tag;
        node = node.sibling;
      }
      return null;
    }
    function traverseVisibleInstancesAndTextInstances(child, searchWithinHosts, fn, a, b, c) {
      for (; null !== child; ) {
        if ((5 === child.tag || 27 === child.tag || 6 === child.tag) && fn(child, a, b, c) || (22 !== child.tag || null === child.memoizedState) && (searchWithinHosts || 5 !== child.tag && 27 !== child.tag) && traverseVisibleInstancesAndTextInstances(
          child.child,
          searchWithinHosts,
          fn,
          a,
          b,
          c
        ))
          return true;
        child = child.sibling;
      }
      return false;
    }
    function getFragmentParentInstanceOrContainerFiber(fiber) {
      for (fiber = fiber.return; null !== fiber; ) {
        if (3 === fiber.tag || 5 === fiber.tag || 27 === fiber.tag) return fiber;
        fiber = fiber.return;
      }
      return null;
    }
    function fiberIsPortaledIntoHost(fiber) {
      var foundPortalParent = false;
      for (fiber = fiber.return; null !== fiber; ) {
        4 === fiber.tag && (foundPortalParent = true);
        if (3 === fiber.tag || 5 === fiber.tag || 27 === fiber.tag) break;
        fiber = fiber.return;
      }
      return foundPortalParent;
    }
    function getFragmentInstanceOrTextInstanceSiblings(fiber) {
      var result = [null, null], parentHostFiber = getFragmentParentInstanceOrContainerFiber(fiber);
      if (null === parentHostFiber) return result;
      findFragmentInstanceOrTextInstanceSiblings(
        result,
        fiber,
        parentHostFiber.child,
        { foundSelf: false }
      );
      return result;
    }
    function findFragmentInstanceOrTextInstanceSiblings(result, self, child, state) {
      for (; null !== child; ) {
        if (child === self) state.foundSelf = true;
        else if (5 === child.tag || 27 === child.tag || 6 === child.tag) {
          if (state.foundSelf) return result[1] = child, true;
          result[0] = child;
        } else if ((22 !== child.tag || null === child.memoizedState) && findFragmentInstanceOrTextInstanceSiblings(
          result,
          self,
          child.child,
          state
        ))
          return true;
        child = child.sibling;
      }
      return false;
    }
    function getInstanceFromHostFiber(fiber) {
      switch (fiber.tag) {
        case 5:
        case 27:
        case 6:
          return fiber.stateNode;
        case 3:
          return fiber.stateNode.containerInfo;
        default:
          throw Error(formatProdErrorMessage(559));
      }
    }
    var searchTarget = null;
    var searchBoundary = null;
    function isFiberPrecedingCheck(child, target, boundary) {
      return child === boundary ? true : child === target ? (searchTarget = child, true) : false;
    }
    function isFiberFollowingCheck(child, target, boundary) {
      return child === boundary ? (searchBoundary = child, false) : child === target ? (null !== searchBoundary && (searchTarget = child), true) : false;
    }
    function getParentForFragmentAncestors(inst) {
      if (null === inst) return null;
      do
        inst = null === inst ? null : inst.return;
      while (inst && 5 !== inst.tag && 27 !== inst.tag && 3 !== inst.tag);
      return inst ? inst : null;
    }
    function getLowestCommonAncestor(instA, instB, getParent2) {
      for (var depthA = 0, tempA = instA; tempA; tempA = getParent2(tempA)) depthA++;
      tempA = 0;
      for (var tempB = instB; tempB; tempB = getParent2(tempB)) tempA++;
      for (; 0 < depthA - tempA; ) instA = getParent2(instA), depthA--;
      for (; 0 < tempA - depthA; ) instB = getParent2(instB), tempA--;
      for (; depthA--; ) {
        if (instA === instB || null !== instB && instA === instB.alternate)
          return instA;
        instA = getParent2(instA);
        instB = getParent2(instB);
      }
      return null;
    }
    var assign = Object.assign;
    var REACT_LEGACY_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.element");
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
    var REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer");
    var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
    var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
    var REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list");
    var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
    var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
    var REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity");
    var REACT_LEGACY_HIDDEN_TYPE = /* @__PURE__ */ Symbol.for("react.legacy_hidden");
    var REACT_MEMO_CACHE_SENTINEL = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel");
    var REACT_VIEW_TRANSITION_TYPE = /* @__PURE__ */ Symbol.for("react.view_transition");
    var REACT_RECOVERABLE_TYPE = /* @__PURE__ */ Symbol.for("react.recoverable");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference");
    function getComponentNameFromType(type) {
      if (null == type) return null;
      if ("function" === typeof type)
        return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
      if ("string" === typeof type) return type;
      switch (type) {
        case REACT_FRAGMENT_TYPE:
          return "Fragment";
        case REACT_PROFILER_TYPE:
          return "Profiler";
        case REACT_STRICT_MODE_TYPE:
          return "StrictMode";
        case REACT_SUSPENSE_TYPE:
          return "Suspense";
        case REACT_SUSPENSE_LIST_TYPE:
          return "SuspenseList";
        case REACT_ACTIVITY_TYPE:
          return "Activity";
        case REACT_VIEW_TRANSITION_TYPE:
          return "ViewTransition";
      }
      if ("object" === typeof type)
        switch (type.$$typeof) {
          case REACT_PORTAL_TYPE:
            return "Portal";
          case REACT_CONTEXT_TYPE:
            return type.displayName || "Context";
          case REACT_CONSUMER_TYPE:
            return (type._context.displayName || "Context") + ".Consumer";
          case REACT_FORWARD_REF_TYPE:
            var innerType = type.render;
            type = type.displayName;
            type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
            return type;
          case REACT_MEMO_TYPE:
            return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
          case REACT_LAZY_TYPE:
            innerType = type._payload;
            type = type._init;
            try {
              return getComponentNameFromType(type(innerType));
            } catch (x) {
            }
        }
      return null;
    }
    var isArrayImpl = Array.isArray;
    var ReactSharedInternals = React9.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    var ReactDOMSharedInternals = ReactDOM2.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    var sharedNotPendingObject = {
      pending: false,
      data: null,
      method: null,
      action: null
    };
    var valueStack = [];
    var index = -1;
    function createCursor(defaultValue) {
      return { current: defaultValue };
    }
    function pop(cursor) {
      0 > index || (cursor.current = valueStack[index], valueStack[index] = null, index--);
    }
    function push(cursor, value) {
      index++;
      valueStack[index] = cursor.current;
      cursor.current = value;
    }
    var contextStackCursor = createCursor(null);
    var contextFiberStackCursor = createCursor(null);
    var rootInstanceStackCursor = createCursor(null);
    var hostTransitionProviderCursor = createCursor(null);
    function pushHostContainer(fiber, nextRootInstance) {
      push(rootInstanceStackCursor, nextRootInstance);
      push(contextFiberStackCursor, fiber);
      push(contextStackCursor, null);
      switch (nextRootInstance.nodeType) {
        case 9:
        case 11:
          fiber = (fiber = nextRootInstance.documentElement) ? (fiber = fiber.namespaceURI) ? getOwnHostContext(fiber) : 0 : 0;
          break;
        default:
          if (fiber = nextRootInstance.tagName, nextRootInstance = nextRootInstance.namespaceURI)
            nextRootInstance = getOwnHostContext(nextRootInstance), fiber = getChildHostContextProd(nextRootInstance, fiber);
          else
            switch (fiber) {
              case "svg":
                fiber = 1;
                break;
              case "math":
                fiber = 2;
                break;
              default:
                fiber = 0;
            }
      }
      pop(contextStackCursor);
      push(contextStackCursor, fiber);
    }
    function popHostContainer() {
      pop(contextStackCursor);
      pop(contextFiberStackCursor);
      pop(rootInstanceStackCursor);
    }
    function pushHostContext(fiber) {
      var stateHook = fiber.memoizedState;
      null !== stateHook && (HostTransitionContext._currentValue = stateHook.memoizedState, push(hostTransitionProviderCursor, fiber));
      stateHook = contextStackCursor.current;
      var JSCompiler_inline_result = getChildHostContextProd(stateHook, fiber.type);
      stateHook !== JSCompiler_inline_result && (push(contextFiberStackCursor, fiber), push(contextStackCursor, JSCompiler_inline_result));
    }
    function popHostContext(fiber) {
      contextFiberStackCursor.current === fiber && (pop(contextStackCursor), pop(contextFiberStackCursor));
      hostTransitionProviderCursor.current === fiber && (pop(hostTransitionProviderCursor), HostTransitionContext._currentValue = sharedNotPendingObject);
    }
    var prefix;
    var suffix;
    function describeBuiltInComponentFrame(name) {
      if (void 0 === prefix)
        try {
          throw Error();
        } catch (x) {
          var match = x.stack.trim().match(/\n( *(at )?)/);
          prefix = match && match[1] || "";
          suffix = -1 < x.stack.indexOf("\n    at") ? " (<anonymous>)" : -1 < x.stack.indexOf("@") ? "@unknown:0:0" : "";
        }
      return "\n" + prefix + name + suffix;
    }
    var reentry = false;
    function describeNativeComponentFrame(fn, construct) {
      if (!fn || reentry) return "";
      reentry = true;
      var previousPrepareStackTrace = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      try {
        var RunInRootFrame = {
          DetermineComponentFrameRoot: function() {
            try {
              if (construct) {
                var Fake = function() {
                  throw Error();
                };
                Object.defineProperty(Fake.prototype, "props", {
                  set: function() {
                    throw Error();
                  }
                });
                if ("object" === typeof Reflect && Reflect.construct) {
                  try {
                    Reflect.construct(Fake, []);
                  } catch (x) {
                    var control = x;
                  }
                  Reflect.construct(fn, [], Fake);
                } else {
                  try {
                    Fake.call();
                  } catch (x$1) {
                    control = x$1;
                  }
                  Fake = false;
                  try {
                    var prevProps = Object.getOwnPropertyDescriptor(
                      fn.prototype,
                      "props"
                    );
                    Object.defineProperty(fn.prototype, "props", {
                      configurable: true,
                      set: function() {
                        throw Error();
                      }
                    });
                    Fake = true;
                    new fn();
                  } finally {
                    Fake && (void 0 !== prevProps ? Object.defineProperty(fn.prototype, "props", prevProps) : delete fn.prototype.props);
                  }
                }
              } else {
                try {
                  throw Error();
                } catch (x$2) {
                  control = x$2;
                }
                (Fake = fn()) && "function" === typeof Fake.catch && Fake.catch(function() {
                });
              }
            } catch (sample) {
              if (sample && control && "string" === typeof sample.stack)
                return [sample.stack, control.stack];
            }
            return [null, null];
          }
        };
        RunInRootFrame.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
        var namePropDescriptor = Object.getOwnPropertyDescriptor(
          RunInRootFrame.DetermineComponentFrameRoot,
          "name"
        );
        namePropDescriptor && namePropDescriptor.configurable && Object.defineProperty(
          RunInRootFrame.DetermineComponentFrameRoot,
          "name",
          { value: "DetermineComponentFrameRoot" }
        );
        var _RunInRootFrame$Deter = RunInRootFrame.DetermineComponentFrameRoot(), sampleStack = _RunInRootFrame$Deter[0], controlStack = _RunInRootFrame$Deter[1];
        if (sampleStack && controlStack) {
          var sampleLines = sampleStack.split("\n"), controlLines = controlStack.split("\n");
          for (namePropDescriptor = RunInRootFrame = 0; RunInRootFrame < sampleLines.length && !sampleLines[RunInRootFrame].includes("DetermineComponentFrameRoot"); )
            RunInRootFrame++;
          for (; namePropDescriptor < controlLines.length && !controlLines[namePropDescriptor].includes(
            "DetermineComponentFrameRoot"
          ); )
            namePropDescriptor++;
          if (RunInRootFrame === sampleLines.length || namePropDescriptor === controlLines.length)
            for (RunInRootFrame = sampleLines.length - 1, namePropDescriptor = controlLines.length - 1; 1 <= RunInRootFrame && 0 <= namePropDescriptor && sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]; )
              namePropDescriptor--;
          for (; 1 <= RunInRootFrame && 0 <= namePropDescriptor; RunInRootFrame--, namePropDescriptor--)
            if (sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
              if (1 !== RunInRootFrame || 1 !== namePropDescriptor) {
                do
                  if (RunInRootFrame--, namePropDescriptor--, 0 > namePropDescriptor || sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
                    var frame = "\n" + sampleLines[RunInRootFrame].replace(" at new ", " at ");
                    fn.displayName && frame.includes("<anonymous>") && (frame = frame.replace("<anonymous>", fn.displayName));
                    return frame;
                  }
                while (1 <= RunInRootFrame && 0 <= namePropDescriptor);
              }
              break;
            }
        }
      } finally {
        reentry = false, Error.prepareStackTrace = previousPrepareStackTrace;
      }
      return (previousPrepareStackTrace = fn ? fn.displayName || fn.name : "") ? describeBuiltInComponentFrame(previousPrepareStackTrace) : "";
    }
    function describeFiber(fiber, childFiber) {
      switch (fiber.tag) {
        case 26:
        case 27:
        case 5:
          return describeBuiltInComponentFrame(fiber.type);
        case 16:
          return describeBuiltInComponentFrame("Lazy");
        case 13:
          return fiber.child !== childFiber && null !== childFiber ? describeBuiltInComponentFrame("Suspense Fallback") : describeBuiltInComponentFrame("Suspense");
        case 19:
          return describeBuiltInComponentFrame("SuspenseList");
        case 0:
        case 15:
          return describeNativeComponentFrame(fiber.type, false);
        case 11:
          return describeNativeComponentFrame(fiber.type.render, false);
        case 1:
          return describeNativeComponentFrame(fiber.type, true);
        case 31:
          return describeBuiltInComponentFrame("Activity");
        case 30:
          return describeBuiltInComponentFrame("ViewTransition");
        default:
          return "";
      }
    }
    function getStackByFiberInDevAndProd(workInProgress2) {
      try {
        var info = "", previous = null;
        do
          info += describeFiber(workInProgress2, previous), previous = workInProgress2, workInProgress2 = workInProgress2.return;
        while (workInProgress2);
        return info;
      } catch (x) {
        return "\nError generating stack: " + x.message + "\n" + x.stack;
      }
    }
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    var scheduleCallback$3 = Scheduler.unstable_scheduleCallback;
    var cancelCallback$1 = Scheduler.unstable_cancelCallback;
    var shouldYield = Scheduler.unstable_shouldYield;
    var requestPaint = Scheduler.unstable_requestPaint;
    var now3 = Scheduler.unstable_now;
    var getCurrentPriorityLevel = Scheduler.unstable_getCurrentPriorityLevel;
    var ImmediatePriority = Scheduler.unstable_ImmediatePriority;
    var UserBlockingPriority = Scheduler.unstable_UserBlockingPriority;
    var NormalPriority$1 = Scheduler.unstable_NormalPriority;
    var LowPriority = Scheduler.unstable_LowPriority;
    var IdlePriority = Scheduler.unstable_IdlePriority;
    var log$1 = Scheduler.log;
    var unstable_setDisableYieldValue = Scheduler.unstable_setDisableYieldValue;
    var rendererID = null;
    var injectedHook = null;
    function setIsStrictModeForDevtools(newIsStrictMode) {
      "function" === typeof log$1 && unstable_setDisableYieldValue(newIsStrictMode);
      if (injectedHook && "function" === typeof injectedHook.setStrictMode)
        try {
          injectedHook.setStrictMode(rendererID, newIsStrictMode);
        } catch (err) {
        }
    }
    var clz32 = Math.clz32 ? Math.clz32 : clz32Fallback;
    var log = Math.log;
    var LN2 = Math.LN2;
    function clz32Fallback(x) {
      x >>>= 0;
      return 0 === x ? 32 : 31 - (log(x) / LN2 | 0) | 0;
    }
    var nextTransitionUpdateLane = 256;
    var nextTransitionDeferredLane = 262144;
    var nextRetryLane = 4194304;
    function getHighestPriorityLanes(lanes) {
      var pendingSyncLanes = lanes & 42;
      if (0 !== pendingSyncLanes) return pendingSyncLanes;
      switch (lanes & -lanes) {
        case 1:
          return 1;
        case 2:
          return 2;
        case 4:
          return 4;
        case 8:
          return 8;
        case 16:
          return 16;
        case 32:
          return 32;
        case 64:
          return 64;
        case 128:
          return 128;
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
          return lanes & -lanes;
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return lanes & 3932160;
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          return lanes & 62914560;
        case 67108864:
          return 67108864;
        case 134217728:
          return 134217728;
        case 268435456:
          return 268435456;
        case 536870912:
          return 536870912;
        case 1073741824:
          return 0;
        default:
          return lanes;
      }
    }
    function getNextLanes(root2, wipLanes, rootHasPendingCommit) {
      var pendingLanes = root2.pendingLanes;
      if (0 === pendingLanes) return 0;
      var nextLanes = 0, suspendedLanes = root2.suspendedLanes, pingedLanes = root2.pingedLanes;
      root2 = root2.warmLanes;
      var nonIdlePendingLanes = pendingLanes & 134217727;
      0 !== nonIdlePendingLanes ? (pendingLanes = nonIdlePendingLanes & ~suspendedLanes, 0 !== pendingLanes ? nextLanes = getHighestPriorityLanes(pendingLanes) : (pingedLanes &= nonIdlePendingLanes, 0 !== pingedLanes ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = nonIdlePendingLanes & ~root2, 0 !== rootHasPendingCommit && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))))) : (nonIdlePendingLanes = pendingLanes & ~suspendedLanes, 0 !== nonIdlePendingLanes ? nextLanes = getHighestPriorityLanes(nonIdlePendingLanes) : 0 !== pingedLanes ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = pendingLanes & ~root2, 0 !== rootHasPendingCommit && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))));
      return 0 === nextLanes ? 0 : 0 !== wipLanes && wipLanes !== nextLanes && 0 === (wipLanes & suspendedLanes) && (suspendedLanes = nextLanes & -nextLanes, rootHasPendingCommit = wipLanes & -wipLanes, suspendedLanes >= rootHasPendingCommit || 32 === suspendedLanes && 0 !== (rootHasPendingCommit & 4194048)) ? wipLanes : nextLanes;
    }
    function checkIfRootIsPrerendering(root2, renderLanes2) {
      return 0 === (root2.pendingLanes & ~(root2.suspendedLanes & ~root2.pingedLanes) & renderLanes2);
    }
    function getEntangledLanes(root2, renderLanes2) {
      0 !== (renderLanes2 & 8) && (renderLanes2 |= renderLanes2 & 32);
      var allEntangledLanes = root2.entangledLanes;
      if (0 !== allEntangledLanes)
        for (root2 = root2.entanglements, allEntangledLanes &= renderLanes2; 0 < allEntangledLanes; ) {
          var index$4 = 31 - clz32(allEntangledLanes), lane = 1 << index$4;
          renderLanes2 |= root2[index$4];
          allEntangledLanes &= ~lane;
        }
      return renderLanes2;
    }
    function computeExpirationTime(lane, currentTime) {
      switch (lane) {
        case 1:
        case 2:
        case 4:
        case 8:
        case 64:
          return currentTime + 250;
        case 16:
        case 32:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return currentTime + 5e3;
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          return -1;
        case 67108864:
        case 134217728:
        case 268435456:
        case 536870912:
        case 1073741824:
          return -1;
        default:
          return -1;
      }
    }
    function claimNextRetryLane() {
      var lane = nextRetryLane;
      nextRetryLane <<= 1;
      0 === (nextRetryLane & 62914560) && (nextRetryLane = 4194304);
      return lane;
    }
    function createLaneMap(initial) {
      for (var laneMap = [], i = 0; 31 > i; i++) laneMap.push(initial);
      return laneMap;
    }
    function markRootUpdated$1(root2, updateLane) {
      root2.pendingLanes |= updateLane;
      268435456 !== updateLane && (root2.suspendedLanes = 0, root2.pingedLanes = 0, root2.warmLanes = 0);
    }
    function markRootFinished(root2, finishedLanes, remainingLanes, spawnedLane, updatedLanes, suspendedRetryLanes) {
      var previouslyPendingLanes = root2.pendingLanes;
      root2.pendingLanes = remainingLanes;
      root2.suspendedLanes = 0;
      root2.pingedLanes = 0;
      root2.warmLanes = 0;
      root2.expiredLanes &= remainingLanes;
      root2.entangledLanes &= remainingLanes;
      root2.errorRecoveryDisabledLanes &= remainingLanes;
      root2.shellSuspendCounter = 0;
      var entanglements = root2.entanglements, expirationTimes = root2.expirationTimes, hiddenUpdates = root2.hiddenUpdates;
      for (remainingLanes = previouslyPendingLanes & ~remainingLanes; 0 < remainingLanes; ) {
        var index$7 = 31 - clz32(remainingLanes), lane = 1 << index$7;
        entanglements[index$7] = 0;
        expirationTimes[index$7] = -1;
        var hiddenUpdatesForLane = hiddenUpdates[index$7];
        if (null !== hiddenUpdatesForLane)
          for (hiddenUpdates[index$7] = null, index$7 = 0; index$7 < hiddenUpdatesForLane.length; index$7++) {
            var update = hiddenUpdatesForLane[index$7];
            null !== update && (update.lane &= -536870913);
          }
        remainingLanes &= ~lane;
      }
      0 !== spawnedLane && markSpawnedDeferredLane(root2, spawnedLane, 0);
      0 !== suspendedRetryLanes && 0 === updatedLanes && 0 !== root2.tag && (root2.suspendedLanes |= suspendedRetryLanes & ~(previouslyPendingLanes & ~finishedLanes));
    }
    function markSpawnedDeferredLane(root2, spawnedLane, entangledLanes) {
      root2.pendingLanes |= spawnedLane;
      root2.suspendedLanes &= ~spawnedLane;
      var spawnedLaneIndex = 31 - clz32(spawnedLane);
      root2.entangledLanes |= spawnedLane;
      root2.entanglements[spawnedLaneIndex] = root2.entanglements[spawnedLaneIndex] | 1073741824 | entangledLanes & 261930;
    }
    function markRootEntangled(root2, entangledLanes) {
      var rootEntangledLanes = root2.entangledLanes |= entangledLanes;
      for (root2 = root2.entanglements; rootEntangledLanes; ) {
        var index$8 = 31 - clz32(rootEntangledLanes), lane = 1 << index$8;
        lane & entangledLanes | root2[index$8] & entangledLanes && (root2[index$8] |= entangledLanes);
        rootEntangledLanes &= ~lane;
      }
    }
    function getBumpedLaneForHydration(root2, renderLanes2) {
      var renderLane = renderLanes2 & -renderLanes2;
      renderLane = 0 !== (renderLane & 42) ? 1 : getBumpedLaneForHydrationByLane(renderLane);
      return 0 !== (renderLane & (root2.suspendedLanes | renderLanes2)) ? 0 : renderLane;
    }
    function getBumpedLaneForHydrationByLane(lane) {
      switch (lane) {
        case 2:
          lane = 1;
          break;
        case 8:
          lane = 4;
          break;
        case 32:
          lane = 16;
          break;
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          lane = 128;
          break;
        case 268435456:
          lane = 134217728;
          break;
        default:
          lane = 0;
      }
      return lane;
    }
    function lanesToEventPriority(lanes) {
      lanes &= -lanes;
      return 2 < lanes ? 8 < lanes ? 0 !== (lanes & 134217727) ? 32 : 268435456 : 8 : 2;
    }
    function resolveUpdatePriority() {
      var updatePriority = ReactDOMSharedInternals.p;
      if (0 !== updatePriority) return updatePriority;
      updatePriority = window.event;
      return void 0 === updatePriority ? 32 : getEventPriority(updatePriority.type);
    }
    function runWithPriority(priority, fn) {
      var previousPriority = ReactDOMSharedInternals.p;
      try {
        return ReactDOMSharedInternals.p = priority, fn();
      } finally {
        ReactDOMSharedInternals.p = previousPriority;
      }
    }
    var randomKey = Math.random().toString(36).slice(2);
    var internalInstanceKey = "__reactFiber$" + randomKey;
    var internalPropsKey = "__reactProps$" + randomKey;
    var internalContainerInstanceKey = "__reactContainer$" + randomKey;
    var internalEventHandlersKey = "__reactEvents$" + randomKey;
    var internalEventHandlerListenersKey = "__reactListeners$" + randomKey;
    var internalEventHandlesSetKey = "__reactHandles$" + randomKey;
    var internalRootNodeResourcesKey = "__reactResources$" + randomKey;
    var internalHoistableMarker = "__reactMarker$" + randomKey;
    var internalLoadPendingKey = "__reactLoad$" + randomKey;
    function detachDeletedInstance(node) {
      delete node[internalInstanceKey];
      delete node[internalPropsKey];
      delete node[internalEventHandlerListenersKey];
      delete node[internalEventHandlesSetKey];
    }
    function getClosestInstanceFromNode(targetNode) {
      var targetInst;
      if (targetInst = targetNode[internalInstanceKey]) return targetInst;
      for (var parentNode = targetNode.parentNode; parentNode; ) {
        if (targetInst = parentNode[internalContainerInstanceKey] || parentNode[internalInstanceKey]) {
          parentNode = targetInst.alternate;
          if (null !== targetInst.child || null !== parentNode && null !== parentNode.child)
            for (targetNode = getParentHydrationBoundary(targetNode); null !== targetNode; ) {
              if (parentNode = targetNode[internalInstanceKey]) return parentNode;
              targetNode = getParentHydrationBoundary(targetNode);
            }
          return targetInst;
        }
        targetNode = parentNode;
        parentNode = targetNode.parentNode;
      }
      return null;
    }
    function getInstanceFromNode(node) {
      if (node = node[internalInstanceKey] || node[internalContainerInstanceKey]) {
        var tag = node.tag;
        if (5 === tag || 6 === tag || 13 === tag || 31 === tag || 26 === tag || 27 === tag || 3 === tag)
          return node;
      }
      return null;
    }
    function getNodeFromInstance(inst) {
      var tag = inst.tag;
      if (5 === tag || 26 === tag || 27 === tag || 6 === tag) return inst.stateNode;
      throw Error(formatProdErrorMessage(33));
    }
    function getResourcesFromRoot(root2) {
      var resources = root2[internalRootNodeResourcesKey];
      resources || (resources = root2[internalRootNodeResourcesKey] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() });
      return resources;
    }
    function markNodeAsHoistable(node) {
      node[internalHoistableMarker] = true;
    }
    function clearPendingLoadOnNode(node) {
      node[internalLoadPendingKey] = void 0;
    }
    var allNativeEvents = /* @__PURE__ */ new Set();
    var registrationNameDependencies = {};
    function registerTwoPhaseEvent(registrationName, dependencies) {
      registerDirectEvent(registrationName, dependencies);
      registerDirectEvent(registrationName + "Capture", dependencies);
    }
    function registerDirectEvent(registrationName, dependencies) {
      registrationNameDependencies[registrationName] = dependencies;
      for (registrationName = 0; registrationName < dependencies.length; registrationName++)
        allNativeEvents.add(dependencies[registrationName]);
    }
    var VALID_ATTRIBUTE_NAME_REGEX = RegExp(
      "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    );
    var illegalAttributeNameCache = {};
    var validatedAttributeNameCache = {};
    function isAttributeNameSafe(attributeName) {
      if (hasOwnProperty.call(validatedAttributeNameCache, attributeName))
        return true;
      if (hasOwnProperty.call(illegalAttributeNameCache, attributeName)) return false;
      if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName))
        return validatedAttributeNameCache[attributeName] = true;
      illegalAttributeNameCache[attributeName] = true;
      return false;
    }
    var viewTransitionMutationContext = false;
    function pushMutationContext() {
      var prev = viewTransitionMutationContext;
      viewTransitionMutationContext = false;
      return prev;
    }
    function setValueForAttribute(node, name, value) {
      if (isAttributeNameSafe(name))
        if (null === value) node.removeAttribute(name);
        else {
          switch (typeof value) {
            case "undefined":
            case "function":
            case "symbol":
              node.removeAttribute(name);
              return;
            case "boolean":
              var prefix$10 = name.toLowerCase().slice(0, 5);
              if ("data-" !== prefix$10 && "aria-" !== prefix$10) {
                node.removeAttribute(name);
                return;
              }
          }
          node.setAttribute(name, value);
        }
    }
    function setValueForKnownAttribute(node, name, value) {
      if (null === value) node.removeAttribute(name);
      else {
        switch (typeof value) {
          case "undefined":
          case "function":
          case "symbol":
          case "boolean":
            node.removeAttribute(name);
            return;
        }
        node.setAttribute(name, value);
      }
    }
    function setValueForNamespacedAttribute(node, namespace, name, value) {
      if (null === value) node.removeAttribute(name);
      else {
        switch (typeof value) {
          case "undefined":
          case "function":
          case "symbol":
          case "boolean":
            node.removeAttribute(name);
            return;
        }
        node.setAttributeNS(namespace, name, value);
      }
    }
    function getToStringValue(value) {
      switch (typeof value) {
        case "bigint":
        case "boolean":
        case "number":
        case "string":
        case "undefined":
          return value;
        case "object":
          return value;
        default:
          return "";
      }
    }
    function isCheckable(elem) {
      var type = elem.type;
      return (elem = elem.nodeName) && "input" === elem.toLowerCase() && ("checkbox" === type || "radio" === type);
    }
    function trackValueOnNode(node, valueField, currentValue) {
      var descriptor = Object.getOwnPropertyDescriptor(
        node.constructor.prototype,
        valueField
      );
      if (!node.hasOwnProperty(valueField) && "undefined" !== typeof descriptor && "function" === typeof descriptor.get && "function" === typeof descriptor.set) {
        var get = descriptor.get, set = descriptor.set;
        Object.defineProperty(node, valueField, {
          configurable: true,
          get: function() {
            return get.call(this);
          },
          set: function(value) {
            currentValue = "" + value;
            set.call(this, value);
          }
        });
        Object.defineProperty(node, valueField, {
          enumerable: descriptor.enumerable
        });
        return {
          getValue: function() {
            return currentValue;
          },
          setValue: function(value) {
            currentValue = "" + value;
          },
          stopTracking: function() {
            node._valueTracker = null;
            delete node[valueField];
          }
        };
      }
    }
    function track(node) {
      if (!node._valueTracker) {
        var valueField = isCheckable(node) ? "checked" : "value";
        node._valueTracker = trackValueOnNode(
          node,
          valueField,
          "" + node[valueField]
        );
      }
    }
    function updateValueIfChanged(node) {
      if (!node) return false;
      var tracker = node._valueTracker;
      if (!tracker) return true;
      var lastValue = tracker.getValue();
      var value = "";
      node && (value = isCheckable(node) ? node.checked ? "true" : "false" : node.value);
      node = value;
      return node !== lastValue ? (tracker.setValue(node), true) : false;
    }
    var escapeSelectorAttributeValueInsideDoubleQuotesRegex = /[\n"\\]/g;
    function escapeSelectorAttributeValueInsideDoubleQuotes(value) {
      return value.replace(
        escapeSelectorAttributeValueInsideDoubleQuotesRegex,
        function(ch) {
          return "\\" + ch.charCodeAt(0).toString(16) + " ";
        }
      );
    }
    function updateInput(element, value, defaultValue, lastDefaultValue, checked, defaultChecked, type, name) {
      element.name = "";
      null != type && "function" !== typeof type && "symbol" !== typeof type && "boolean" !== typeof type ? element.type = type : element.removeAttribute("type");
      if (null != value)
        if ("number" === type) {
          if (0 === value && "" === element.value || element.value != value)
            element.value = "" + getToStringValue(value);
        } else
          element.value !== "" + getToStringValue(value) && (element.value = "" + getToStringValue(value));
      else
        "submit" !== type && "reset" !== type || element.removeAttribute("value");
      null != value ? "number" === type && element.value == value ? setDefaultValue(element, getToStringValue(element.value)) : setDefaultValue(element, getToStringValue(value)) : null != defaultValue ? setDefaultValue(element, getToStringValue(defaultValue)) : null != lastDefaultValue && element.removeAttribute("value");
      null == checked && null != defaultChecked && (element.defaultChecked = !!defaultChecked);
      null != checked && (element.checked = checked && "function" !== typeof checked && "symbol" !== typeof checked);
      null != name && "function" !== typeof name && "symbol" !== typeof name && "boolean" !== typeof name ? element.name = "" + getToStringValue(name) : element.removeAttribute("name");
    }
    function initInput(element, value, defaultValue, checked, defaultChecked, type, name, isHydrating2) {
      null != type && "function" !== typeof type && "symbol" !== typeof type && "boolean" !== typeof type && (element.type = type);
      if (null != value || null != defaultValue) {
        if (!("submit" !== type && "reset" !== type || void 0 !== value && null !== value)) {
          track(element);
          return;
        }
        defaultValue = null != defaultValue ? "" + getToStringValue(defaultValue) : "";
        value = null != value ? "" + getToStringValue(value) : defaultValue;
        isHydrating2 || value === element.value || (element.value = value);
        element.defaultValue = value;
      }
      checked = null != checked ? checked : defaultChecked;
      checked = "function" !== typeof checked && "symbol" !== typeof checked && !!checked;
      element.checked = isHydrating2 ? element.checked : !!checked;
      element.defaultChecked = !!checked;
      null != name && "function" !== typeof name && "symbol" !== typeof name && "boolean" !== typeof name && (element.name = name);
      track(element);
    }
    function setDefaultValue(node, value) {
      node.defaultValue !== "" + value && (node.defaultValue = "" + value);
    }
    function updateOptions(node, multiple, propValue, setDefaultSelected) {
      node = node.options;
      if (multiple) {
        multiple = {};
        for (var i = 0; i < propValue.length; i++)
          multiple["$" + propValue[i]] = true;
        for (propValue = 0; propValue < node.length; propValue++)
          i = multiple.hasOwnProperty("$" + node[propValue].value), node[propValue].selected !== i && (node[propValue].selected = i), i && setDefaultSelected && (node[propValue].defaultSelected = true);
      } else {
        propValue = "" + getToStringValue(propValue);
        multiple = null;
        for (i = 0; i < node.length; i++) {
          if (node[i].value === propValue) {
            node[i].selected = true;
            setDefaultSelected && (node[i].defaultSelected = true);
            return;
          }
          null !== multiple || node[i].disabled || (multiple = node[i]);
        }
        null !== multiple && (multiple.selected = true);
      }
    }
    function updateTextarea(element, value, defaultValue) {
      if (null != value && (value = "" + getToStringValue(value), value !== element.value && (element.value = value), null == defaultValue)) {
        element.defaultValue !== value && (element.defaultValue = value);
        return;
      }
      element.defaultValue = null != defaultValue ? "" + getToStringValue(defaultValue) : "";
    }
    function initTextarea(element, value, defaultValue, children) {
      if (null == value) {
        if (null != children) {
          if (null != defaultValue) throw Error(formatProdErrorMessage(92));
          if (isArrayImpl(children)) {
            if (1 < children.length) throw Error(formatProdErrorMessage(93));
            children = children[0];
          }
          defaultValue = children;
        }
        null == defaultValue && (defaultValue = "");
        value = defaultValue;
      }
      defaultValue = getToStringValue(value);
      element.defaultValue = defaultValue;
      children = element.textContent;
      children === defaultValue && "" !== children && null !== children && (element.value = children);
      track(element);
    }
    function setTextContent(node, text) {
      if (text) {
        var firstChild = node.firstChild;
        if (firstChild && firstChild === node.lastChild && 3 === firstChild.nodeType) {
          firstChild.nodeValue = text;
          return;
        }
      }
      node.textContent = text;
    }
    var unitlessNumbers = new Set(
      "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
        " "
      )
    );
    function setValueForStyle(style2, styleName, value) {
      var isCustomProperty = 0 === styleName.indexOf("--");
      null == value || "boolean" === typeof value || "" === value ? isCustomProperty ? style2.setProperty(styleName, "") : "float" === styleName ? style2.cssFloat = "" : style2[styleName] = "" : isCustomProperty ? style2.setProperty(styleName, value) : "number" !== typeof value || 0 === value || unitlessNumbers.has(styleName) ? "float" === styleName ? style2.cssFloat = value : style2[styleName] = ("" + value).trim() : style2[styleName] = value + "px";
    }
    function setValueForStyles(node, styles, prevStyles) {
      if (null != styles && "object" !== typeof styles)
        throw Error(formatProdErrorMessage(62));
      node = node.style;
      if (null != prevStyles) {
        for (var styleName in prevStyles)
          !prevStyles.hasOwnProperty(styleName) || null != styles && styles.hasOwnProperty(styleName) || (0 === styleName.indexOf("--") ? node.setProperty(styleName, "") : "float" === styleName ? node.cssFloat = "" : node[styleName] = "", viewTransitionMutationContext = true);
        for (var styleName$16 in styles)
          styleName = styles[styleName$16], styles.hasOwnProperty(styleName$16) && prevStyles[styleName$16] !== styleName && (setValueForStyle(node, styleName$16, styleName), viewTransitionMutationContext = true);
      } else
        for (var styleName$17 in styles)
          styles.hasOwnProperty(styleName$17) && setValueForStyle(node, styleName$17, styles[styleName$17]);
    }
    function isCustomElement(tagName) {
      if (-1 === tagName.indexOf("-")) return false;
      switch (tagName) {
        case "annotation-xml":
        case "color-profile":
        case "font-face":
        case "font-face-src":
        case "font-face-uri":
        case "font-face-format":
        case "font-face-name":
        case "missing-glyph":
          return false;
        default:
          return true;
      }
    }
    var aliases = /* @__PURE__ */ new Map([
      ["acceptCharset", "accept-charset"],
      ["htmlFor", "for"],
      ["httpEquiv", "http-equiv"],
      ["crossOrigin", "crossorigin"],
      ["accentHeight", "accent-height"],
      ["alignmentBaseline", "alignment-baseline"],
      ["arabicForm", "arabic-form"],
      ["baselineShift", "baseline-shift"],
      ["capHeight", "cap-height"],
      ["clipPath", "clip-path"],
      ["clipRule", "clip-rule"],
      ["colorInterpolation", "color-interpolation"],
      ["colorInterpolationFilters", "color-interpolation-filters"],
      ["colorProfile", "color-profile"],
      ["colorRendering", "color-rendering"],
      ["dominantBaseline", "dominant-baseline"],
      ["enableBackground", "enable-background"],
      ["fillOpacity", "fill-opacity"],
      ["fillRule", "fill-rule"],
      ["floodColor", "flood-color"],
      ["floodOpacity", "flood-opacity"],
      ["fontFamily", "font-family"],
      ["fontSize", "font-size"],
      ["fontSizeAdjust", "font-size-adjust"],
      ["fontStretch", "font-stretch"],
      ["fontStyle", "font-style"],
      ["fontVariant", "font-variant"],
      ["fontWeight", "font-weight"],
      ["glyphName", "glyph-name"],
      ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
      ["glyphOrientationVertical", "glyph-orientation-vertical"],
      ["horizAdvX", "horiz-adv-x"],
      ["horizOriginX", "horiz-origin-x"],
      ["imageRendering", "image-rendering"],
      ["letterSpacing", "letter-spacing"],
      ["lightingColor", "lighting-color"],
      ["markerEnd", "marker-end"],
      ["markerMid", "marker-mid"],
      ["markerStart", "marker-start"],
      ["maskType", "mask-type"],
      ["overlinePosition", "overline-position"],
      ["overlineThickness", "overline-thickness"],
      ["paintOrder", "paint-order"],
      ["panose-1", "panose-1"],
      ["pointerEvents", "pointer-events"],
      ["renderingIntent", "rendering-intent"],
      ["shapeRendering", "shape-rendering"],
      ["stopColor", "stop-color"],
      ["stopOpacity", "stop-opacity"],
      ["strikethroughPosition", "strikethrough-position"],
      ["strikethroughThickness", "strikethrough-thickness"],
      ["strokeDasharray", "stroke-dasharray"],
      ["strokeDashoffset", "stroke-dashoffset"],
      ["strokeLinecap", "stroke-linecap"],
      ["strokeLinejoin", "stroke-linejoin"],
      ["strokeMiterlimit", "stroke-miterlimit"],
      ["strokeOpacity", "stroke-opacity"],
      ["strokeWidth", "stroke-width"],
      ["textAnchor", "text-anchor"],
      ["textDecoration", "text-decoration"],
      ["textRendering", "text-rendering"],
      ["transformOrigin", "transform-origin"],
      ["underlinePosition", "underline-position"],
      ["underlineThickness", "underline-thickness"],
      ["unicodeBidi", "unicode-bidi"],
      ["unicodeRange", "unicode-range"],
      ["unitsPerEm", "units-per-em"],
      ["vAlphabetic", "v-alphabetic"],
      ["vHanging", "v-hanging"],
      ["vIdeographic", "v-ideographic"],
      ["vMathematical", "v-mathematical"],
      ["vectorEffect", "vector-effect"],
      ["vertAdvY", "vert-adv-y"],
      ["vertOriginX", "vert-origin-x"],
      ["vertOriginY", "vert-origin-y"],
      ["wordSpacing", "word-spacing"],
      ["writingMode", "writing-mode"],
      ["xmlnsXlink", "xmlns:xlink"],
      ["xHeight", "x-height"]
    ]);
    var isJavaScriptProtocol = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
    function sanitizeURL(url) {
      return isJavaScriptProtocol.test("" + url) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : url;
    }
    function noop$1() {
    }
    var currentReplayingEvent = null;
    function getEventTarget(nativeEvent) {
      nativeEvent = nativeEvent.target || nativeEvent.srcElement || window;
      nativeEvent.correspondingUseElement && (nativeEvent = nativeEvent.correspondingUseElement);
      return 3 === nativeEvent.nodeType ? nativeEvent.parentNode : nativeEvent;
    }
    var restoreTarget = null;
    var restoreQueue = null;
    function restoreStateOfTarget(target) {
      var internalInstance = getInstanceFromNode(target);
      if (internalInstance && (target = internalInstance.stateNode)) {
        var props = target[internalPropsKey] || null;
        a: switch (target = internalInstance.stateNode, internalInstance.type) {
          case "input":
            updateInput(
              target,
              props.value,
              props.defaultValue,
              props.defaultValue,
              props.checked,
              props.defaultChecked,
              props.type,
              props.name
            );
            internalInstance = props.name;
            if ("radio" === props.type && null != internalInstance) {
              for (props = target; props.parentNode; ) props = props.parentNode;
              props = props.querySelectorAll(
                'input[name="' + escapeSelectorAttributeValueInsideDoubleQuotes(
                  "" + internalInstance
                ) + '"][type="radio"]'
              );
              for (internalInstance = 0; internalInstance < props.length; internalInstance++) {
                var otherNode = props[internalInstance];
                if (otherNode !== target && otherNode.form === target.form) {
                  var otherProps = otherNode[internalPropsKey] || null;
                  if (!otherProps) throw Error(formatProdErrorMessage(90));
                  updateInput(
                    otherNode,
                    otherProps.value,
                    otherProps.defaultValue,
                    otherProps.defaultValue,
                    otherProps.checked,
                    otherProps.defaultChecked,
                    otherProps.type,
                    otherProps.name
                  );
                }
              }
              for (internalInstance = 0; internalInstance < props.length; internalInstance++)
                otherNode = props[internalInstance], otherNode.form === target.form && updateValueIfChanged(otherNode);
            }
            break a;
          case "textarea":
            updateTextarea(target, props.value, props.defaultValue);
            break a;
          case "select":
            internalInstance = props.value, null != internalInstance && updateOptions(target, !!props.multiple, internalInstance, false);
        }
      }
    }
    var isInsideEventHandler = false;
    function batchedUpdates$1(fn, a, b) {
      if (isInsideEventHandler) return fn(a, b);
      isInsideEventHandler = true;
      try {
        var JSCompiler_inline_result = fn(a);
        return JSCompiler_inline_result;
      } finally {
        if (isInsideEventHandler = false, null !== restoreTarget || null !== restoreQueue) {
          if (flushSyncWork$1(), restoreTarget && (a = restoreTarget, fn = restoreQueue, restoreQueue = restoreTarget = null, restoreStateOfTarget(a), fn))
            for (a = 0; a < fn.length; a++) restoreStateOfTarget(fn[a]);
        }
      }
    }
    function getListener(inst, registrationName) {
      var stateNode = inst.stateNode;
      if (null === stateNode) return null;
      var props = stateNode[internalPropsKey] || null;
      if (null === props) return null;
      stateNode = props[registrationName];
      a: switch (registrationName) {
        case "onClick":
        case "onClickCapture":
        case "onDoubleClick":
        case "onDoubleClickCapture":
        case "onMouseDown":
        case "onMouseDownCapture":
        case "onMouseMove":
        case "onMouseMoveCapture":
        case "onMouseUp":
        case "onMouseUpCapture":
        case "onMouseEnter":
          (props = !props.disabled) || (inst = inst.type, props = !("button" === inst || "input" === inst || "select" === inst || "textarea" === inst));
          inst = !props;
          break a;
        default:
          inst = false;
      }
      if (inst) return null;
      if (stateNode && "function" !== typeof stateNode)
        throw Error(
          formatProdErrorMessage(231, registrationName, typeof stateNode)
        );
      return stateNode;
    }
    var canUseDOM = !("undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement);
    var passiveBrowserEventsSupported = false;
    if (canUseDOM)
      try {
        options = {};
        Object.defineProperty(options, "passive", {
          get: function() {
            passiveBrowserEventsSupported = true;
          }
        });
        window.addEventListener("test", options, options);
        window.removeEventListener("test", options, options);
      } catch (e) {
        passiveBrowserEventsSupported = false;
      }
    var options;
    var root = null;
    var startText = null;
    var fallbackText = null;
    function getData() {
      if (fallbackText) return fallbackText;
      var start, startValue = startText, startLength = startValue.length, end, endValue = "value" in root ? root.value : root.textContent, endLength = endValue.length;
      for (start = 0; start < startLength && startValue[start] === endValue[start]; start++) ;
      var minEnd = startLength - start;
      for (end = 1; end <= minEnd && startValue[startLength - end] === endValue[endLength - end]; end++) ;
      return fallbackText = endValue.slice(start, 1 < end ? 1 - end : void 0);
    }
    function getEventCharCode(nativeEvent) {
      var keyCode = nativeEvent.keyCode;
      "charCode" in nativeEvent ? (nativeEvent = nativeEvent.charCode, 0 === nativeEvent && 13 === keyCode && (nativeEvent = 13)) : nativeEvent = keyCode;
      10 === nativeEvent && (nativeEvent = 13);
      return 32 <= nativeEvent || 13 === nativeEvent ? nativeEvent : 0;
    }
    function functionThatReturnsTrue() {
      return true;
    }
    function functionThatReturnsFalse() {
      return false;
    }
    function createSyntheticEvent(Interface) {
      function SyntheticBaseEvent(reactName, reactEventType, targetInst, nativeEvent, nativeEventTarget) {
        this._reactName = reactName;
        this._targetInst = targetInst;
        this.type = reactEventType;
        this.nativeEvent = nativeEvent;
        this.target = nativeEventTarget;
        this.currentTarget = null;
        for (var propName in Interface)
          Interface.hasOwnProperty(propName) && (reactName = Interface[propName], this[propName] = reactName ? reactName(nativeEvent) : nativeEvent[propName]);
        this.isDefaultPrevented = (null != nativeEvent.defaultPrevented ? nativeEvent.defaultPrevented : false === nativeEvent.returnValue) ? functionThatReturnsTrue : functionThatReturnsFalse;
        this.isPropagationStopped = functionThatReturnsFalse;
        return this;
      }
      assign(SyntheticBaseEvent.prototype, {
        preventDefault: function() {
          this.defaultPrevented = true;
          var event = this.nativeEvent;
          event && (event.preventDefault ? event.preventDefault() : "unknown" !== typeof event.returnValue && (event.returnValue = false), this.isDefaultPrevented = functionThatReturnsTrue);
        },
        stopPropagation: function() {
          var event = this.nativeEvent;
          event && (event.stopPropagation ? event.stopPropagation() : "unknown" !== typeof event.cancelBubble && (event.cancelBubble = true), this.isPropagationStopped = functionThatReturnsTrue);
        },
        persist: function() {
        },
        isPersistent: functionThatReturnsTrue
      });
      return SyntheticBaseEvent;
    }
    var EventInterface = {
      eventPhase: 0,
      bubbles: 0,
      cancelable: 0,
      timeStamp: function(event) {
        return event.timeStamp || Date.now();
      },
      defaultPrevented: 0,
      isTrusted: 0
    };
    var SyntheticEvent = createSyntheticEvent(EventInterface);
    var UIEventInterface = assign({}, EventInterface, { view: 0, detail: 0 });
    var SyntheticUIEvent = createSyntheticEvent(UIEventInterface);
    var lastMovementX;
    var lastMovementY;
    var lastMouseEvent;
    var MouseEventInterface = assign({}, UIEventInterface, {
      screenX: 0,
      screenY: 0,
      clientX: 0,
      clientY: 0,
      pageX: 0,
      pageY: 0,
      ctrlKey: 0,
      shiftKey: 0,
      altKey: 0,
      metaKey: 0,
      getModifierState: getEventModifierState,
      button: 0,
      buttons: 0,
      relatedTarget: function(event) {
        return void 0 === event.relatedTarget ? event.fromElement === event.srcElement ? event.toElement : event.fromElement : event.relatedTarget;
      },
      movementX: function(event) {
        if ("movementX" in event) return event.movementX;
        event !== lastMouseEvent && (lastMouseEvent && "mousemove" === event.type ? (lastMovementX = event.screenX - lastMouseEvent.screenX, lastMovementY = event.screenY - lastMouseEvent.screenY) : lastMovementY = lastMovementX = 0, lastMouseEvent = event);
        return lastMovementX;
      },
      movementY: function(event) {
        return "movementY" in event ? event.movementY : lastMovementY;
      }
    });
    var SyntheticMouseEvent = createSyntheticEvent(MouseEventInterface);
    var DragEventInterface = assign({}, MouseEventInterface, { dataTransfer: 0 });
    var SyntheticDragEvent = createSyntheticEvent(DragEventInterface);
    var FocusEventInterface = assign({}, UIEventInterface, { relatedTarget: 0 });
    var SyntheticFocusEvent = createSyntheticEvent(FocusEventInterface);
    var AnimationEventInterface = assign({}, EventInterface, {
      animationName: 0,
      elapsedTime: 0,
      pseudoElement: 0
    });
    var SyntheticAnimationEvent = createSyntheticEvent(AnimationEventInterface);
    var ClipboardEventInterface = assign({}, EventInterface, {
      clipboardData: function(event) {
        return "clipboardData" in event ? event.clipboardData : window.clipboardData;
      }
    });
    var SyntheticClipboardEvent = createSyntheticEvent(ClipboardEventInterface);
    var CompositionEventInterface = assign({}, EventInterface, { data: 0 });
    var SyntheticCompositionEvent = createSyntheticEvent(CompositionEventInterface);
    var normalizeKey = {
      Esc: "Escape",
      Spacebar: " ",
      Left: "ArrowLeft",
      Up: "ArrowUp",
      Right: "ArrowRight",
      Down: "ArrowDown",
      Del: "Delete",
      Win: "OS",
      Menu: "ContextMenu",
      Apps: "ContextMenu",
      Scroll: "ScrollLock",
      MozPrintableKey: "Unidentified"
    };
    var translateToKey = {
      8: "Backspace",
      9: "Tab",
      12: "Clear",
      13: "Enter",
      16: "Shift",
      17: "Control",
      18: "Alt",
      19: "Pause",
      20: "CapsLock",
      27: "Escape",
      32: " ",
      33: "PageUp",
      34: "PageDown",
      35: "End",
      36: "Home",
      37: "ArrowLeft",
      38: "ArrowUp",
      39: "ArrowRight",
      40: "ArrowDown",
      45: "Insert",
      46: "Delete",
      112: "F1",
      113: "F2",
      114: "F3",
      115: "F4",
      116: "F5",
      117: "F6",
      118: "F7",
      119: "F8",
      120: "F9",
      121: "F10",
      122: "F11",
      123: "F12",
      144: "NumLock",
      145: "ScrollLock",
      224: "Meta"
    };
    var modifierKeyToProp = {
      Alt: "altKey",
      Control: "ctrlKey",
      Meta: "metaKey",
      Shift: "shiftKey"
    };
    function modifierStateGetter(keyArg) {
      var nativeEvent = this.nativeEvent;
      return nativeEvent.getModifierState ? nativeEvent.getModifierState(keyArg) : (keyArg = modifierKeyToProp[keyArg]) ? !!nativeEvent[keyArg] : false;
    }
    function getEventModifierState() {
      return modifierStateGetter;
    }
    var KeyboardEventInterface = assign({}, UIEventInterface, {
      key: function(nativeEvent) {
        if (nativeEvent.key) {
          var key2 = normalizeKey[nativeEvent.key] || nativeEvent.key;
          if ("Unidentified" !== key2) return key2;
        }
        return "keypress" === nativeEvent.type ? (nativeEvent = getEventCharCode(nativeEvent), 13 === nativeEvent ? "Enter" : String.fromCharCode(nativeEvent)) : "keydown" === nativeEvent.type || "keyup" === nativeEvent.type ? translateToKey[nativeEvent.keyCode] || "Unidentified" : "";
      },
      code: 0,
      location: 0,
      ctrlKey: 0,
      shiftKey: 0,
      altKey: 0,
      metaKey: 0,
      repeat: 0,
      locale: 0,
      getModifierState: getEventModifierState,
      charCode: function(event) {
        return "keypress" === event.type ? getEventCharCode(event) : 0;
      },
      keyCode: function(event) {
        return "keydown" === event.type || "keyup" === event.type ? event.keyCode : 0;
      },
      which: function(event) {
        return "keypress" === event.type ? getEventCharCode(event) : "keydown" === event.type || "keyup" === event.type ? event.keyCode : 0;
      }
    });
    var SyntheticKeyboardEvent = createSyntheticEvent(KeyboardEventInterface);
    var PointerEventInterface = assign({}, MouseEventInterface, {
      pointerId: 0,
      width: 0,
      height: 0,
      pressure: 0,
      tangentialPressure: 0,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      pointerType: 0,
      isPrimary: 0
    });
    var SyntheticPointerEvent = createSyntheticEvent(PointerEventInterface);
    var SubmitEventInterface = assign({}, EventInterface, { submitter: 0 });
    var SyntheticSubmitEvent = createSyntheticEvent(SubmitEventInterface);
    var TouchEventInterface = assign({}, UIEventInterface, {
      touches: 0,
      targetTouches: 0,
      changedTouches: 0,
      altKey: 0,
      metaKey: 0,
      ctrlKey: 0,
      shiftKey: 0,
      getModifierState: getEventModifierState
    });
    var SyntheticTouchEvent = createSyntheticEvent(TouchEventInterface);
    var TransitionEventInterface = assign({}, EventInterface, {
      propertyName: 0,
      elapsedTime: 0,
      pseudoElement: 0
    });
    var SyntheticTransitionEvent = createSyntheticEvent(TransitionEventInterface);
    var WheelEventInterface = assign({}, MouseEventInterface, {
      deltaX: function(event) {
        return "deltaX" in event ? event.deltaX : "wheelDeltaX" in event ? -event.wheelDeltaX : 0;
      },
      deltaY: function(event) {
        return "deltaY" in event ? event.deltaY : "wheelDeltaY" in event ? -event.wheelDeltaY : "wheelDelta" in event ? -event.wheelDelta : 0;
      },
      deltaZ: 0,
      deltaMode: 0
    });
    var SyntheticWheelEvent = createSyntheticEvent(WheelEventInterface);
    var ToggleEventInterface = assign({}, EventInterface, {
      newState: 0,
      oldState: 0,
      source: 0
    });
    var SyntheticToggleEvent = createSyntheticEvent(ToggleEventInterface);
    var END_KEYCODES = [9, 13, 27, 32];
    var canUseCompositionEvent = canUseDOM && "CompositionEvent" in window;
    var documentMode = null;
    canUseDOM && "documentMode" in document && (documentMode = document.documentMode);
    var canUseTextInputEvent = canUseDOM && "TextEvent" in window && !documentMode;
    var useFallbackCompositionData = canUseDOM && (!canUseCompositionEvent || documentMode && 8 < documentMode && 11 >= documentMode);
    var SPACEBAR_CHAR = String.fromCharCode(32);
    var hasSpaceKeypress = false;
    function isFallbackCompositionEnd(domEventName, nativeEvent) {
      switch (domEventName) {
        case "keyup":
          return -1 !== END_KEYCODES.indexOf(nativeEvent.keyCode);
        case "keydown":
          return 229 !== nativeEvent.keyCode;
        case "keypress":
        case "mousedown":
        case "focusout":
          return true;
        default:
          return false;
      }
    }
    function getDataFromCustomEvent(nativeEvent) {
      nativeEvent = nativeEvent.detail;
      return "object" === typeof nativeEvent && "data" in nativeEvent ? nativeEvent.data : null;
    }
    var isComposing = false;
    function getNativeBeforeInputChars(domEventName, nativeEvent) {
      switch (domEventName) {
        case "compositionend":
          return getDataFromCustomEvent(nativeEvent);
        case "keypress":
          if (32 !== nativeEvent.which) return null;
          hasSpaceKeypress = true;
          return SPACEBAR_CHAR;
        case "textInput":
          return domEventName = nativeEvent.data, domEventName === SPACEBAR_CHAR && hasSpaceKeypress ? null : domEventName;
        default:
          return null;
      }
    }
    function getFallbackBeforeInputChars(domEventName, nativeEvent) {
      if (isComposing)
        return "compositionend" === domEventName || !canUseCompositionEvent && isFallbackCompositionEnd(domEventName, nativeEvent) ? (domEventName = getData(), fallbackText = startText = root = null, isComposing = false, domEventName) : null;
      switch (domEventName) {
        case "paste":
          return null;
        case "keypress":
          if (!(nativeEvent.ctrlKey || nativeEvent.altKey || nativeEvent.metaKey) || nativeEvent.ctrlKey && nativeEvent.altKey) {
            if (nativeEvent.char && 1 < nativeEvent.char.length)
              return nativeEvent.char;
            if (nativeEvent.which) return String.fromCharCode(nativeEvent.which);
          }
          return null;
        case "compositionend":
          return useFallbackCompositionData && "ko" !== nativeEvent.locale ? null : nativeEvent.data;
        default:
          return null;
      }
    }
    var supportedInputTypes = {
      color: true,
      date: true,
      datetime: true,
      "datetime-local": true,
      email: true,
      month: true,
      number: true,
      password: true,
      range: true,
      search: true,
      tel: true,
      text: true,
      time: true,
      url: true,
      week: true
    };
    function isTextInputElement(elem) {
      var nodeName = elem && elem.nodeName && elem.nodeName.toLowerCase();
      return "input" === nodeName ? !!supportedInputTypes[elem.type] : "textarea" === nodeName ? true : false;
    }
    function createAndAccumulateChangeEvent(dispatchQueue, inst, nativeEvent, target) {
      restoreTarget ? restoreQueue ? restoreQueue.push(target) : restoreQueue = [target] : restoreTarget = target;
      inst = accumulateTwoPhaseListeners(inst, "onChange");
      0 < inst.length && (nativeEvent = new SyntheticEvent(
        "onChange",
        "change",
        null,
        nativeEvent,
        target
      ), dispatchQueue.push({ event: nativeEvent, listeners: inst }));
    }
    var activeElement$1 = null;
    var activeElementInst$1 = null;
    function runEventInBatch(dispatchQueue) {
      processDispatchQueue(dispatchQueue, 0);
    }
    function getInstIfValueChanged(targetInst) {
      var targetNode = getNodeFromInstance(targetInst);
      if (updateValueIfChanged(targetNode)) return targetInst;
    }
    function getTargetInstForChangeEvent(domEventName, targetInst) {
      if ("change" === domEventName) return targetInst;
    }
    var isInputEventSupported = false;
    if (canUseDOM) {
      if (canUseDOM) {
        isSupported$jscomp$inline_474 = "oninput" in document;
        if (!isSupported$jscomp$inline_474) {
          element$jscomp$inline_475 = document.createElement("div");
          element$jscomp$inline_475.setAttribute("oninput", "return;");
          isSupported$jscomp$inline_474 = "function" === typeof element$jscomp$inline_475.oninput;
        }
        JSCompiler_inline_result$jscomp$318 = isSupported$jscomp$inline_474;
      } else JSCompiler_inline_result$jscomp$318 = false;
      isInputEventSupported = JSCompiler_inline_result$jscomp$318 && (!document.documentMode || 9 < document.documentMode);
    }
    var JSCompiler_inline_result$jscomp$318;
    var isSupported$jscomp$inline_474;
    var element$jscomp$inline_475;
    function stopWatchingForValueChange() {
      activeElement$1 && (activeElement$1.detachEvent("onpropertychange", handlePropertyChange), activeElementInst$1 = activeElement$1 = null);
    }
    function handlePropertyChange(nativeEvent) {
      if ("value" === nativeEvent.propertyName && getInstIfValueChanged(activeElementInst$1)) {
        var dispatchQueue = [];
        createAndAccumulateChangeEvent(
          dispatchQueue,
          activeElementInst$1,
          nativeEvent,
          getEventTarget(nativeEvent)
        );
        batchedUpdates$1(runEventInBatch, dispatchQueue);
      }
    }
    function handleEventsForInputEventPolyfill(domEventName, target, targetInst) {
      "focusin" === domEventName ? (stopWatchingForValueChange(), activeElement$1 = target, activeElementInst$1 = targetInst, activeElement$1.attachEvent("onpropertychange", handlePropertyChange)) : "focusout" === domEventName && stopWatchingForValueChange();
    }
    function getTargetInstForInputEventPolyfill(domEventName) {
      if ("selectionchange" === domEventName || "keyup" === domEventName || "keydown" === domEventName)
        return getInstIfValueChanged(activeElementInst$1);
    }
    function getTargetInstForClickEvent(domEventName, targetInst) {
      if ("click" === domEventName) return getInstIfValueChanged(targetInst);
    }
    function getTargetInstForInputOrChangeEvent(domEventName, targetInst) {
      if ("input" === domEventName || "change" === domEventName)
        return getInstIfValueChanged(targetInst);
    }
    function is(x, y) {
      return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
    }
    var objectIs = "function" === typeof Object.is ? Object.is : is;
    function shallowEqual(objA, objB) {
      if (objectIs(objA, objB)) return true;
      if ("object" !== typeof objA || null === objA || "object" !== typeof objB || null === objB)
        return false;
      var keysA = Object.keys(objA), keysB = Object.keys(objB);
      if (keysA.length !== keysB.length) return false;
      for (keysB = 0; keysB < keysA.length; keysB++) {
        var currentKey = keysA[keysB];
        if (!hasOwnProperty.call(objB, currentKey) || !objectIs(objA[currentKey], objB[currentKey]))
          return false;
      }
      return true;
    }
    function getActiveElement(doc) {
      doc = doc || ("undefined" !== typeof document ? document : void 0);
      if ("undefined" === typeof doc) return null;
      try {
        return doc.activeElement || doc.body;
      } catch (e$20) {
        return doc.body;
      }
    }
    function getLeafNode(node) {
      for (; node && node.firstChild; ) node = node.firstChild;
      return node;
    }
    function getNodeForCharacterOffset(root2, offset) {
      var node = getLeafNode(root2);
      root2 = 0;
      for (var nodeEnd; node; ) {
        if (3 === node.nodeType) {
          nodeEnd = root2 + node.textContent.length;
          if (root2 <= offset && nodeEnd >= offset)
            return { node, offset: offset - root2 };
          root2 = nodeEnd;
        }
        a: {
          for (; node; ) {
            if (node.nextSibling) {
              node = node.nextSibling;
              break a;
            }
            node = node.parentNode;
          }
          node = void 0;
        }
        node = getLeafNode(node);
      }
    }
    function containsNode(outerNode, innerNode) {
      return outerNode && innerNode ? outerNode === innerNode ? true : outerNode && 3 === outerNode.nodeType ? false : innerNode && 3 === innerNode.nodeType ? containsNode(outerNode, innerNode.parentNode) : "contains" in outerNode ? outerNode.contains(innerNode) : outerNode.compareDocumentPosition ? !!(outerNode.compareDocumentPosition(innerNode) & 16) : false : false;
    }
    function getActiveElementDeep(containerInfo) {
      containerInfo = null != containerInfo && null != containerInfo.ownerDocument && null != containerInfo.ownerDocument.defaultView ? containerInfo.ownerDocument.defaultView : window;
      for (var element = getActiveElement(containerInfo.document); element instanceof containerInfo.HTMLIFrameElement; ) {
        try {
          var JSCompiler_inline_result = "string" === typeof element.contentWindow.location.href;
        } catch (err) {
          JSCompiler_inline_result = false;
        }
        if (JSCompiler_inline_result) containerInfo = element.contentWindow;
        else break;
        element = getActiveElement(containerInfo.document);
      }
      return element;
    }
    function hasSelectionCapabilities(elem) {
      var nodeName = elem && elem.nodeName && elem.nodeName.toLowerCase();
      return nodeName && ("input" === nodeName && ("text" === elem.type || "search" === elem.type || "tel" === elem.type || "url" === elem.type || "password" === elem.type) || "textarea" === nodeName || "true" === elem.contentEditable);
    }
    var skipSelectionChangeEvent = canUseDOM && "documentMode" in document && 11 >= document.documentMode;
    var activeElement = null;
    var activeElementInst = null;
    var lastSelection = null;
    var mouseDown = false;
    function constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget) {
      var doc = nativeEventTarget.window === nativeEventTarget ? nativeEventTarget.document : 9 === nativeEventTarget.nodeType ? nativeEventTarget : nativeEventTarget.ownerDocument;
      mouseDown || null == activeElement || activeElement !== getActiveElement(doc) || (doc = activeElement, "selectionStart" in doc && hasSelectionCapabilities(doc) ? doc = { start: doc.selectionStart, end: doc.selectionEnd } : (doc = (doc.ownerDocument && doc.ownerDocument.defaultView || window).getSelection(), doc = {
        anchorNode: doc.anchorNode,
        anchorOffset: doc.anchorOffset,
        focusNode: doc.focusNode,
        focusOffset: doc.focusOffset
      }), lastSelection && shallowEqual(lastSelection, doc) || (lastSelection = doc, doc = accumulateTwoPhaseListeners(activeElementInst, "onSelect"), 0 < doc.length && (nativeEvent = new SyntheticEvent(
        "onSelect",
        "select",
        null,
        nativeEvent,
        nativeEventTarget
      ), dispatchQueue.push({ event: nativeEvent, listeners: doc }), nativeEvent.target = activeElement)));
    }
    function makePrefixMap(styleProp, eventName) {
      var prefixes = {};
      prefixes[styleProp.toLowerCase()] = eventName.toLowerCase();
      prefixes["Webkit" + styleProp] = "webkit" + eventName;
      prefixes["Moz" + styleProp] = "moz" + eventName;
      return prefixes;
    }
    var vendorPrefixes = {
      animationend: makePrefixMap("Animation", "AnimationEnd"),
      animationiteration: makePrefixMap("Animation", "AnimationIteration"),
      animationstart: makePrefixMap("Animation", "AnimationStart"),
      transitionrun: makePrefixMap("Transition", "TransitionRun"),
      transitionstart: makePrefixMap("Transition", "TransitionStart"),
      transitioncancel: makePrefixMap("Transition", "TransitionCancel"),
      transitionend: makePrefixMap("Transition", "TransitionEnd")
    };
    var prefixedEventNames = {};
    var style = {};
    canUseDOM && (style = document.createElement("div").style, "AnimationEvent" in window || (delete vendorPrefixes.animationend.animation, delete vendorPrefixes.animationiteration.animation, delete vendorPrefixes.animationstart.animation), "TransitionEvent" in window || delete vendorPrefixes.transitionend.transition);
    function getVendorPrefixedEventName(eventName) {
      if (prefixedEventNames[eventName]) return prefixedEventNames[eventName];
      if (!vendorPrefixes[eventName]) return eventName;
      var prefixMap = vendorPrefixes[eventName], styleProp;
      for (styleProp in prefixMap)
        if (prefixMap.hasOwnProperty(styleProp) && styleProp in style)
          return prefixedEventNames[eventName] = prefixMap[styleProp];
      return eventName;
    }
    var ANIMATION_END = getVendorPrefixedEventName("animationend");
    var ANIMATION_ITERATION = getVendorPrefixedEventName("animationiteration");
    var ANIMATION_START = getVendorPrefixedEventName("animationstart");
    var TRANSITION_RUN = getVendorPrefixedEventName("transitionrun");
    var TRANSITION_START = getVendorPrefixedEventName("transitionstart");
    var TRANSITION_CANCEL = getVendorPrefixedEventName("transitioncancel");
    var TRANSITION_END = getVendorPrefixedEventName("transitionend");
    var topLevelEventsToReactNames = /* @__PURE__ */ new Map();
    var simpleEventPluginEvents = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error fullscreenChange fullscreenError gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
      " "
    );
    simpleEventPluginEvents.push("scrollEnd");
    function registerSimpleEvent(domEventName, reactName) {
      topLevelEventsToReactNames.set(domEventName, reactName);
      registerTwoPhaseEvent(reactName, [domEventName]);
    }
    var globalClientIdCounter$1 = 0;
    function getViewTransitionName(props, instance) {
      if (null != props.name && "auto" !== props.name) return props.name;
      if (null !== instance.autoName) return instance.autoName;
      props = pendingEffectsRoot.identifierPrefix;
      var globalClientId = globalClientIdCounter$1++;
      props = "_" + props + "t_" + globalClientId.toString(32) + "_";
      return instance.autoName = props;
    }
    function getClassNameByType(classByType) {
      if (null == classByType || "string" === typeof classByType)
        return classByType;
      var className = null, activeTypes = pendingTransitionTypes;
      if (null !== activeTypes)
        for (var i = 0; i < activeTypes.length; i++) {
          var match = classByType[activeTypes[i]];
          if (null != match) {
            if ("none" === match) return "none";
            className = null == className ? match : className + (" " + match);
          }
        }
      return null == className ? classByType.default : className;
    }
    function getViewTransitionClassName(defaultClass, eventClass) {
      defaultClass = getClassNameByType(defaultClass);
      eventClass = getClassNameByType(eventClass);
      return null == eventClass ? "auto" === defaultClass ? null : defaultClass : "auto" === eventClass ? null : eventClass;
    }
    var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
      if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event)) return;
      } else if ("object" === typeof process && "function" === typeof process.emit) {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    };
    var concurrentQueues = [];
    var concurrentQueuesIndex = 0;
    var concurrentlyUpdatedLanes = 0;
    function finishQueueingConcurrentUpdates() {
      for (var endIndex = concurrentQueuesIndex, i = concurrentlyUpdatedLanes = concurrentQueuesIndex = 0; i < endIndex; ) {
        var fiber = concurrentQueues[i];
        concurrentQueues[i++] = null;
        var queue = concurrentQueues[i];
        concurrentQueues[i++] = null;
        var update = concurrentQueues[i];
        concurrentQueues[i++] = null;
        var lane = concurrentQueues[i];
        concurrentQueues[i++] = null;
        if (null !== queue && null !== update) {
          var pending = queue.pending;
          null === pending ? update.next = update : (update.next = pending.next, pending.next = update);
          queue.pending = update;
        }
        0 !== lane && markUpdateLaneFromFiberToRoot(fiber, update, lane);
      }
    }
    function enqueueUpdate$1(fiber, queue, update, lane) {
      concurrentQueues[concurrentQueuesIndex++] = fiber;
      concurrentQueues[concurrentQueuesIndex++] = queue;
      concurrentQueues[concurrentQueuesIndex++] = update;
      concurrentQueues[concurrentQueuesIndex++] = lane;
      concurrentlyUpdatedLanes |= lane;
      fiber.lanes |= lane;
      fiber = fiber.alternate;
      null !== fiber && (fiber.lanes |= lane);
    }
    function enqueueConcurrentHookUpdate(fiber, queue, update, lane) {
      enqueueUpdate$1(fiber, queue, update, lane);
      return getRootForUpdatedFiber(fiber);
    }
    function enqueueConcurrentRenderForLane(fiber, lane) {
      enqueueUpdate$1(fiber, null, null, lane);
      return getRootForUpdatedFiber(fiber);
    }
    function markUpdateLaneFromFiberToRoot(sourceFiber, update, lane) {
      sourceFiber.lanes |= lane;
      var alternate = sourceFiber.alternate;
      null !== alternate && (alternate.lanes |= lane);
      for (var isHidden = false, parent = sourceFiber.return; null !== parent; )
        parent.childLanes |= lane, alternate = parent.alternate, null !== alternate && (alternate.childLanes |= lane), 22 === parent.tag && (sourceFiber = parent.stateNode, null === sourceFiber || sourceFiber._visibility & 1 || (isHidden = true)), sourceFiber = parent, parent = parent.return;
      return 3 === sourceFiber.tag ? (parent = sourceFiber.stateNode, isHidden && null !== update && (isHidden = 31 - clz32(lane), sourceFiber = parent.hiddenUpdates, alternate = sourceFiber[isHidden], null === alternate ? sourceFiber[isHidden] = [update] : alternate.push(update), update.lane = lane | 536870912), parent) : null;
    }
    function getRootForUpdatedFiber(sourceFiber) {
      if (50 < nestedUpdateCount)
        throw nestedUpdateCount = 0, rootWithNestedUpdates = null, Error(formatProdErrorMessage(185));
      for (var parent = sourceFiber.return; null !== parent; )
        sourceFiber = parent, parent = sourceFiber.return;
      return 3 === sourceFiber.tag ? sourceFiber.stateNode : null;
    }
    var emptyContextObject = {};
    function FiberNode(tag, pendingProps, key2, mode) {
      this.tag = tag;
      this.key = key2;
      this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
      this.index = 0;
      this.refCleanup = this.ref = null;
      this.pendingProps = pendingProps;
      this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
      this.mode = mode;
      this.subtreeFlags = this.flags = 0;
      this.deletions = null;
      this.childLanes = this.lanes = 0;
      this.alternate = null;
    }
    function createFiberImplClass(tag, pendingProps, key2, mode) {
      return new FiberNode(tag, pendingProps, key2, mode);
    }
    function shouldConstruct(Component) {
      Component = Component.prototype;
      return !(!Component || !Component.isReactComponent);
    }
    function createWorkInProgress(current2, pendingProps) {
      var workInProgress2 = current2.alternate;
      null === workInProgress2 ? (workInProgress2 = createFiberImplClass(
        current2.tag,
        pendingProps,
        current2.key,
        current2.mode
      ), workInProgress2.elementType = current2.elementType, workInProgress2.type = current2.type, workInProgress2.stateNode = current2.stateNode, workInProgress2.alternate = current2, current2.alternate = workInProgress2) : (workInProgress2.pendingProps = pendingProps, workInProgress2.type = current2.type, workInProgress2.flags = 0, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null);
      workInProgress2.flags = current2.flags & 1206910976;
      workInProgress2.childLanes = current2.childLanes;
      workInProgress2.lanes = current2.lanes;
      workInProgress2.child = current2.child;
      workInProgress2.memoizedProps = current2.memoizedProps;
      workInProgress2.memoizedState = current2.memoizedState;
      workInProgress2.updateQueue = current2.updateQueue;
      pendingProps = current2.dependencies;
      workInProgress2.dependencies = null === pendingProps ? null : { lanes: pendingProps.lanes, firstContext: pendingProps.firstContext };
      workInProgress2.sibling = current2.sibling;
      workInProgress2.index = current2.index;
      workInProgress2.ref = current2.ref;
      workInProgress2.refCleanup = current2.refCleanup;
      return workInProgress2;
    }
    function resetWorkInProgress(workInProgress2, renderLanes2) {
      workInProgress2.flags &= 1206910978;
      var current2 = workInProgress2.alternate;
      null === current2 ? (workInProgress2.childLanes = 0, workInProgress2.lanes = renderLanes2, workInProgress2.child = null, workInProgress2.subtreeFlags = 0, workInProgress2.memoizedProps = null, workInProgress2.memoizedState = null, workInProgress2.updateQueue = null, workInProgress2.dependencies = null, workInProgress2.stateNode = null) : (workInProgress2.childLanes = current2.childLanes, workInProgress2.lanes = current2.lanes, workInProgress2.child = current2.child, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null, workInProgress2.memoizedProps = current2.memoizedProps, workInProgress2.memoizedState = current2.memoizedState, workInProgress2.updateQueue = current2.updateQueue, workInProgress2.type = current2.type, renderLanes2 = current2.dependencies, workInProgress2.dependencies = null === renderLanes2 ? null : {
        lanes: renderLanes2.lanes,
        firstContext: renderLanes2.firstContext
      });
      return workInProgress2;
    }
    function createFiberFromTypeAndProps(type, key2, pendingProps, owner, mode, lanes) {
      var fiberTag = 0;
      owner = type;
      if ("function" === typeof owner) shouldConstruct(owner) && (fiberTag = 1);
      else if ("string" === typeof owner)
        fiberTag = isHostHoistableType(
          type,
          pendingProps,
          contextStackCursor.current
        ) ? 26 : "html" === type || "head" === type || "body" === type ? 27 : 5;
      else
        a: switch (owner) {
          case REACT_ACTIVITY_TYPE:
            return type = createFiberImplClass(31, pendingProps, key2, mode), type.elementType = REACT_ACTIVITY_TYPE, type.lanes = lanes, type;
          case REACT_FRAGMENT_TYPE:
            return createFiberFromFragment(pendingProps.children, mode, lanes, key2);
          case REACT_STRICT_MODE_TYPE:
            fiberTag = 8;
            mode |= 24;
            break;
          case REACT_PROFILER_TYPE:
            return type = createFiberImplClass(12, pendingProps, key2, mode | 2), type.elementType = REACT_PROFILER_TYPE, type.lanes = lanes, type;
          case REACT_SUSPENSE_TYPE:
            return type = createFiberImplClass(13, pendingProps, key2, mode), type.elementType = REACT_SUSPENSE_TYPE, type.lanes = lanes, type;
          case REACT_SUSPENSE_LIST_TYPE:
            return type = createFiberImplClass(19, pendingProps, key2, mode), type.elementType = REACT_SUSPENSE_LIST_TYPE, type.lanes = lanes, type;
          case REACT_LEGACY_HIDDEN_TYPE:
          case REACT_VIEW_TRANSITION_TYPE:
            return type = mode | 32, type = createFiberImplClass(30, pendingProps, key2, type), type.elementType = REACT_VIEW_TRANSITION_TYPE, type.lanes = lanes, type.stateNode = {
              autoName: null,
              paired: null,
              clones: null,
              ref: null
            }, type;
          default:
            if ("object" === typeof owner && null !== owner)
              switch (owner.$$typeof) {
                case REACT_CONTEXT_TYPE:
                  fiberTag = 10;
                  break a;
                case REACT_CONSUMER_TYPE:
                  fiberTag = 9;
                  break a;
                case REACT_FORWARD_REF_TYPE:
                  fiberTag = 11;
                  break a;
                case REACT_MEMO_TYPE:
                  fiberTag = 14;
                  break a;
                case REACT_LAZY_TYPE:
                  fiberTag = 16;
                  owner = null;
                  break a;
              }
            fiberTag = 29;
            pendingProps = Error(
              formatProdErrorMessage(130, null === type ? "null" : typeof type, "")
            );
            owner = null;
        }
      key2 = createFiberImplClass(fiberTag, pendingProps, key2, mode);
      key2.elementType = type;
      key2.type = owner;
      key2.lanes = lanes;
      return key2;
    }
    function createFiberFromFragment(elements, mode, lanes, key2) {
      elements = createFiberImplClass(7, elements, key2, mode);
      elements.lanes = lanes;
      return elements;
    }
    function createFiberFromText(content, mode, lanes) {
      content = createFiberImplClass(6, content, null, mode);
      content.lanes = lanes;
      return content;
    }
    function createFiberFromDehydratedFragment(dehydratedNode) {
      var fiber = createFiberImplClass(18, null, null, 0);
      fiber.stateNode = dehydratedNode;
      return fiber;
    }
    function createFiberFromPortal(portal, mode, lanes) {
      mode = createFiberImplClass(
        4,
        null !== portal.children ? portal.children : [],
        portal.key,
        mode
      );
      mode.lanes = lanes;
      mode.stateNode = {
        containerInfo: portal.containerInfo,
        pendingChildren: null,
        implementation: portal.implementation
      };
      return mode;
    }
    var CapturedStacks = /* @__PURE__ */ new WeakMap();
    function createCapturedValueAtFiber(value, source) {
      if ("object" === typeof value && null !== value) {
        var existing = CapturedStacks.get(value);
        if (void 0 !== existing) return existing;
        source = {
          value,
          source,
          stack: getStackByFiberInDevAndProd(source)
        };
        CapturedStacks.set(value, source);
        return source;
      }
      return {
        value,
        source,
        stack: getStackByFiberInDevAndProd(source)
      };
    }
    var forkStack = [];
    var forkStackIndex = 0;
    var treeForkProvider = null;
    var treeForkCount = 0;
    var idStack = [];
    var idStackIndex = 0;
    var treeContextProvider = null;
    var treeContextId = 1;
    var treeContextOverflow = "";
    function pushTreeFork(workInProgress2, totalChildren) {
      forkStack[forkStackIndex++] = treeForkCount;
      forkStack[forkStackIndex++] = treeForkProvider;
      treeForkProvider = workInProgress2;
      treeForkCount = totalChildren;
    }
    function pushTreeId(workInProgress2, totalChildren, index2) {
      idStack[idStackIndex++] = treeContextId;
      idStack[idStackIndex++] = treeContextOverflow;
      idStack[idStackIndex++] = treeContextProvider;
      treeContextProvider = workInProgress2;
      var baseIdWithLeadingBit = treeContextId;
      workInProgress2 = treeContextOverflow;
      var baseLength = 32 - clz32(baseIdWithLeadingBit) - 1;
      baseIdWithLeadingBit &= ~(1 << baseLength);
      index2 += 1;
      var length = 32 - clz32(totalChildren) + baseLength;
      if (30 < length) {
        var numberOfOverflowBits = baseLength - baseLength % 5;
        length = (baseIdWithLeadingBit & (1 << numberOfOverflowBits) - 1).toString(32);
        baseIdWithLeadingBit >>= numberOfOverflowBits;
        baseLength -= numberOfOverflowBits;
        treeContextId = 1 << 32 - clz32(totalChildren) + baseLength | index2 << baseLength | baseIdWithLeadingBit;
        treeContextOverflow = length + workInProgress2;
      } else
        treeContextId = 1 << length | index2 << baseLength | baseIdWithLeadingBit, treeContextOverflow = workInProgress2;
    }
    function pushMaterializedTreeId(workInProgress2) {
      null !== workInProgress2.return && (pushTreeFork(workInProgress2, 1), pushTreeId(workInProgress2, 1, 0));
    }
    function popTreeContext(workInProgress2) {
      for (; workInProgress2 === treeForkProvider; )
        treeForkProvider = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null, treeForkCount = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null;
      for (; workInProgress2 === treeContextProvider; )
        treeContextProvider = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextOverflow = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextId = idStack[--idStackIndex], idStack[idStackIndex] = null;
    }
    function restoreSuspendedTreeContext(workInProgress2, suspendedContext) {
      idStack[idStackIndex++] = treeContextId;
      idStack[idStackIndex++] = treeContextOverflow;
      idStack[idStackIndex++] = treeContextProvider;
      treeContextId = suspendedContext.id;
      treeContextOverflow = suspendedContext.overflow;
      treeContextProvider = workInProgress2;
    }
    var hydrationParentFiber = null;
    var nextHydratableInstance = null;
    var isHydrating = false;
    var hydrationErrors = null;
    var rootOrSingletonContext = false;
    var HydrationMismatchException = Error(formatProdErrorMessage(519));
    function throwOnHydrationMismatch(fiber) {
      var error = Error(
        formatProdErrorMessage(
          418,
          1 < arguments.length && void 0 !== arguments[1] && arguments[1] ? "text" : "HTML",
          ""
        )
      );
      queueHydrationError(createCapturedValueAtFiber(error, fiber));
      throw HydrationMismatchException;
    }
    function prepareToHydrateHostInstance(fiber) {
      var instance = fiber.stateNode, type = fiber.type, props = fiber.memoizedProps;
      instance[internalInstanceKey] = fiber;
      instance[internalPropsKey] = props;
      switch (type) {
        case "dialog":
          listenToNonDelegatedEvent("cancel", instance);
          listenToNonDelegatedEvent("close", instance);
          break;
        case "iframe":
        case "object":
        case "embed":
          listenToNonDelegatedEvent("load", instance);
          break;
        case "video":
        case "audio":
          for (type = 0; type < mediaEventTypes.length; type++)
            listenToNonDelegatedEvent(mediaEventTypes[type], instance);
          break;
        case "source":
          listenToNonDelegatedEvent("error", instance);
          break;
        case "img":
        case "image":
        case "link":
          listenToNonDelegatedEvent("error", instance);
          listenToNonDelegatedEvent("load", instance);
          break;
        case "details":
          listenToNonDelegatedEvent("toggle", instance);
          break;
        case "input":
          listenToNonDelegatedEvent("invalid", instance);
          initInput(
            instance,
            props.value,
            props.defaultValue,
            props.checked,
            props.defaultChecked,
            props.type,
            props.name,
            true
          );
          break;
        case "select":
          listenToNonDelegatedEvent("invalid", instance);
          break;
        case "textarea":
          listenToNonDelegatedEvent("invalid", instance), initTextarea(instance, props.value, props.defaultValue, props.children);
      }
      type = props.children;
      "string" !== typeof type && "number" !== typeof type && "bigint" !== typeof type || instance.textContent === "" + type || true === props.suppressHydrationWarning || checkForUnmatchedText(instance.textContent, type) ? (null != props.popover && (listenToNonDelegatedEvent("beforetoggle", instance), listenToNonDelegatedEvent("toggle", instance)), null != props.onScroll && listenToNonDelegatedEvent("scroll", instance), null != props.onScrollEnd && listenToNonDelegatedEvent("scrollend", instance), null != props.onClick && (instance.onclick = noop$1), instance = true) : instance = false;
      instance || throwOnHydrationMismatch(fiber, true);
    }
    function popToNextHostParent(fiber) {
      for (hydrationParentFiber = fiber.return; hydrationParentFiber; )
        switch (hydrationParentFiber.tag) {
          case 5:
          case 31:
          case 13:
            rootOrSingletonContext = false;
            return;
          case 27:
          case 3:
            rootOrSingletonContext = true;
            return;
          default:
            hydrationParentFiber = hydrationParentFiber.return;
        }
    }
    function popHydrationState(fiber) {
      if (fiber !== hydrationParentFiber) return false;
      if (!isHydrating) return popToNextHostParent(fiber), isHydrating = true, false;
      var tag = fiber.tag, JSCompiler_temp;
      if (JSCompiler_temp = 3 !== tag && 27 !== tag) {
        if (JSCompiler_temp = 5 === tag)
          JSCompiler_temp = fiber.type, JSCompiler_temp = !("form" !== JSCompiler_temp && "button" !== JSCompiler_temp) || shouldSetTextContent(fiber.type, fiber.memoizedProps);
        JSCompiler_temp = !JSCompiler_temp;
      }
      JSCompiler_temp && nextHydratableInstance && throwOnHydrationMismatch(fiber);
      popToNextHostParent(fiber);
      if (13 === tag) {
        fiber = fiber.memoizedState;
        fiber = null !== fiber ? fiber.dehydrated : null;
        if (!fiber) throw Error(formatProdErrorMessage(317));
        nextHydratableInstance = getNextHydratableInstanceAfterHydrationBoundary(fiber);
      } else if (31 === tag) {
        fiber = fiber.memoizedState;
        fiber = null !== fiber ? fiber.dehydrated : null;
        if (!fiber) throw Error(formatProdErrorMessage(317));
        nextHydratableInstance = getNextHydratableInstanceAfterHydrationBoundary(fiber);
      } else
        27 === tag ? (tag = nextHydratableInstance, isSingletonScope(fiber.type) ? (fiber = previousHydratableOnEnteringScopedSingleton, previousHydratableOnEnteringScopedSingleton = null, nextHydratableInstance = fiber) : nextHydratableInstance = tag) : nextHydratableInstance = hydrationParentFiber ? getNextHydratable(fiber.stateNode.nextSibling) : null;
      return true;
    }
    function resetHydrationState() {
      nextHydratableInstance = hydrationParentFiber = null;
      isHydrating = false;
    }
    function upgradeHydrationErrorsToRecoverable() {
      var queuedErrors = hydrationErrors;
      null !== queuedErrors && (null === workInProgressRootRecoverableErrors ? workInProgressRootRecoverableErrors = queuedErrors : workInProgressRootRecoverableErrors.push.apply(
        workInProgressRootRecoverableErrors,
        queuedErrors
      ), hydrationErrors = null);
      return queuedErrors;
    }
    function queueHydrationError(error) {
      null === hydrationErrors ? hydrationErrors = [error] : hydrationErrors.push(error);
    }
    var valueCursor = createCursor(null);
    var currentlyRenderingFiber$1 = null;
    var lastContextDependency = null;
    function pushProvider(providerFiber, context, nextValue) {
      push(valueCursor, context._currentValue);
      context._currentValue = nextValue;
    }
    function popProvider(context) {
      context._currentValue = valueCursor.current;
      pop(valueCursor);
    }
    function scheduleContextWorkOnParentPath(parent, renderLanes2, propagationRoot) {
      for (; null !== parent; ) {
        var alternate = parent.alternate;
        (parent.childLanes & renderLanes2) !== renderLanes2 ? (parent.childLanes |= renderLanes2, null !== alternate && (alternate.childLanes |= renderLanes2)) : null !== alternate && (alternate.childLanes & renderLanes2) !== renderLanes2 && (alternate.childLanes |= renderLanes2);
        if (parent === propagationRoot) break;
        parent = parent.return;
      }
    }
    function propagateContextChanges(workInProgress2, contexts, renderLanes2, forcePropagateEntireTree) {
      var fiber = workInProgress2.child;
      null !== fiber && (fiber.return = workInProgress2);
      for (; null !== fiber; ) {
        var list = fiber.dependencies;
        if (null !== list) {
          var nextFiber = fiber.child;
          list = list.firstContext;
          a: for (; null !== list; ) {
            var dependency = list;
            list = fiber;
            for (var i = 0; i < contexts.length; i++)
              if (dependency.context === contexts[i]) {
                list.lanes |= renderLanes2;
                dependency = list.alternate;
                null !== dependency && (dependency.lanes |= renderLanes2);
                scheduleContextWorkOnParentPath(
                  list.return,
                  renderLanes2,
                  workInProgress2
                );
                forcePropagateEntireTree || (nextFiber = null);
                break a;
              }
            list = dependency.next;
          }
        } else if (18 === fiber.tag) {
          nextFiber = fiber.return;
          if (null === nextFiber) throw Error(formatProdErrorMessage(341));
          nextFiber.lanes |= renderLanes2;
          list = nextFiber.alternate;
          null !== list && (list.lanes |= renderLanes2);
          scheduleContextWorkOnParentPath(nextFiber, renderLanes2, workInProgress2);
          nextFiber = null;
        } else
          13 === fiber.tag && null !== fiber.memoizedState && null === fiber.memoizedState.dehydrated ? (fiber.lanes |= renderLanes2, nextFiber = fiber.alternate, null !== nextFiber && (nextFiber.lanes |= renderLanes2), scheduleContextWorkOnParentPath(
            fiber.return,
            renderLanes2,
            workInProgress2
          ), nextFiber = fiber.child, nextFiber = null !== nextFiber ? nextFiber.sibling : null) : nextFiber = fiber.child;
        if (null !== nextFiber) nextFiber.return = fiber;
        else
          for (nextFiber = fiber; null !== nextFiber; ) {
            if (nextFiber === workInProgress2) {
              nextFiber = null;
              break;
            }
            fiber = nextFiber.sibling;
            if (null !== fiber) {
              fiber.return = nextFiber.return;
              nextFiber = fiber;
              break;
            }
            nextFiber = nextFiber.return;
          }
        fiber = nextFiber;
      }
    }
    function propagateParentContextChanges(current2, workInProgress2, renderLanes2, forcePropagateEntireTree) {
      current2 = null;
      for (var parent = workInProgress2, isInsidePropagationBailout = false; null !== parent; ) {
        if (!isInsidePropagationBailout) {
          if (0 !== (parent.flags & 524288)) isInsidePropagationBailout = true;
          else if (0 !== (parent.flags & 262144)) break;
        }
        if (10 === parent.tag) {
          var currentParent = parent.alternate;
          if (null === currentParent) throw Error(formatProdErrorMessage(387));
          currentParent = currentParent.memoizedProps;
          if (null !== currentParent) {
            var context = parent.type;
            objectIs(parent.pendingProps.value, currentParent.value) || (null !== current2 ? current2.push(context) : current2 = [context]);
          }
        } else if (parent === hostTransitionProviderCursor.current) {
          currentParent = parent.alternate;
          if (null === currentParent) throw Error(formatProdErrorMessage(387));
          currentParent.memoizedState.memoizedState !== parent.memoizedState.memoizedState && (null !== current2 ? current2.push(HostTransitionContext) : current2 = [HostTransitionContext]);
        }
        parent = parent.return;
      }
      null !== current2 && propagateContextChanges(
        workInProgress2,
        current2,
        renderLanes2,
        forcePropagateEntireTree
      );
      workInProgress2.flags |= 262144;
      return null !== current2;
    }
    function checkIfContextChanged(currentDependencies) {
      for (currentDependencies = currentDependencies.firstContext; null !== currentDependencies; ) {
        if (!objectIs(
          currentDependencies.context._currentValue,
          currentDependencies.memoizedValue
        ))
          return true;
        currentDependencies = currentDependencies.next;
      }
      return false;
    }
    function prepareToReadContext(workInProgress2) {
      currentlyRenderingFiber$1 = workInProgress2;
      lastContextDependency = null;
      workInProgress2 = workInProgress2.dependencies;
      null !== workInProgress2 && (workInProgress2.firstContext = null);
    }
    function readContext(context) {
      return readContextForConsumer(currentlyRenderingFiber$1, context);
    }
    function readContextDuringReconciliation(consumer, context) {
      null === currentlyRenderingFiber$1 && prepareToReadContext(consumer);
      return readContextForConsumer(consumer, context);
    }
    function readContextForConsumer(consumer, context) {
      var value = context._currentValue;
      context = { context, memoizedValue: value, next: null };
      if (null === lastContextDependency) {
        if (null === consumer) throw Error(formatProdErrorMessage(308));
        lastContextDependency = context;
        consumer.dependencies = { lanes: 0, firstContext: context };
        consumer.flags |= 524288;
      } else lastContextDependency = lastContextDependency.next = context;
      return value;
    }
    var AbortControllerLocal = "undefined" !== typeof AbortController ? AbortController : function() {
      var listeners2 = [], signal = this.signal = {
        aborted: false,
        addEventListener: function(type, listener) {
          listeners2.push(listener);
        }
      };
      this.abort = function() {
        signal.aborted = true;
        listeners2.forEach(function(listener) {
          return listener();
        });
      };
    };
    var scheduleCallback$2 = Scheduler.unstable_scheduleCallback;
    var NormalPriority = Scheduler.unstable_NormalPriority;
    var CacheContext = {
      $$typeof: REACT_CONTEXT_TYPE,
      Consumer: null,
      Provider: null,
      _currentValue: null,
      _currentValue2: null,
      _threadCount: 0
    };
    function createCache() {
      return {
        controller: new AbortControllerLocal(),
        data: /* @__PURE__ */ new Map(),
        refCount: 0
      };
    }
    function releaseCache(cache) {
      cache.refCount--;
      0 === cache.refCount && scheduleCallback$2(NormalPriority, function() {
        cache.controller.abort();
      });
    }
    function queueTransitionTypes(root2, transitionTypes) {
      if (0 !== (root2.pendingLanes & 4194048)) {
        var queued = root2.transitionTypes;
        null === queued && (queued = root2.transitionTypes = []);
        for (root2 = 0; root2 < transitionTypes.length; root2++) {
          var transitionType = transitionTypes[root2];
          -1 === queued.indexOf(transitionType) && queued.push(transitionType);
        }
      }
    }
    var entangledTransitionTypes = null;
    function claimQueuedTransitionTypes(root2) {
      var claimed = root2.transitionTypes;
      root2.transitionTypes = null;
      return claimed;
    }
    var currentEntangledListeners = null;
    var currentEntangledPendingCount = 0;
    var currentEntangledLane = 0;
    var currentEntangledActionThenable = null;
    function entangleAsyncAction(transition, thenable) {
      if (null === currentEntangledListeners) {
        var entangledListeners = currentEntangledListeners = [];
        currentEntangledPendingCount = 0;
        currentEntangledLane = requestTransitionLane();
        currentEntangledActionThenable = {
          status: "pending",
          value: void 0,
          then: function(resolve) {
            entangledListeners.push(resolve);
          }
        };
      }
      currentEntangledPendingCount++;
      thenable.then(pingEngtangledActionScope, pingEngtangledActionScope);
      return thenable;
    }
    function pingEngtangledActionScope() {
      if (0 === --currentEntangledPendingCount && (entangledTransitionTypes = null, null !== currentEntangledListeners)) {
        null !== currentEntangledActionThenable && (currentEntangledActionThenable.status = "fulfilled");
        var listeners2 = currentEntangledListeners;
        currentEntangledListeners = null;
        currentEntangledLane = 0;
        currentEntangledActionThenable = null;
        for (var i = 0; i < listeners2.length; i++) (0, listeners2[i])();
      }
    }
    function chainThenableValue(thenable, result) {
      var listeners2 = [], thenableWithOverride = {
        status: "pending",
        value: null,
        reason: null,
        then: function(resolve) {
          listeners2.push(resolve);
        }
      };
      thenable.then(
        function() {
          thenableWithOverride.status = "fulfilled";
          thenableWithOverride.value = result;
          for (var i = 0; i < listeners2.length; i++) (0, listeners2[i])(result);
        },
        function(error) {
          thenableWithOverride.status = "rejected";
          thenableWithOverride.reason = error;
          for (error = 0; error < listeners2.length; error++)
            (0, listeners2[error])(void 0);
        }
      );
      return thenableWithOverride;
    }
    var prevOnStartTransitionFinish = ReactSharedInternals.S;
    ReactSharedInternals.S = function(transition, returnValue) {
      globalMostRecentTransitionTime = now3();
      "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && entangleAsyncAction(transition, returnValue);
      if (null !== entangledTransitionTypes)
        for (var root$28 = firstScheduledRoot; null !== root$28; )
          queueTransitionTypes(root$28, entangledTransitionTypes), root$28 = root$28.next;
      root$28 = transition.types;
      if (null !== root$28) {
        for (var root$29 = firstScheduledRoot; null !== root$29; )
          queueTransitionTypes(root$29, root$28), root$29 = root$29.next;
        if (0 !== currentEntangledLane) {
          root$29 = entangledTransitionTypes;
          null === root$29 && (root$29 = entangledTransitionTypes = []);
          for (var i = 0; i < root$28.length; i++) {
            var transitionType = root$28[i];
            -1 === root$29.indexOf(transitionType) && root$29.push(transitionType);
          }
        }
      }
      null !== prevOnStartTransitionFinish && prevOnStartTransitionFinish(transition, returnValue);
    };
    var resumedCache = createCursor(null);
    function peekCacheFromPool() {
      var cacheResumedFromPreviousRender = resumedCache.current;
      return null !== cacheResumedFromPreviousRender ? cacheResumedFromPreviousRender : workInProgressRoot.pooledCache;
    }
    function pushTransition(offscreenWorkInProgress, prevCachePool) {
      null === prevCachePool ? push(resumedCache, resumedCache.current) : push(resumedCache, prevCachePool.pool);
    }
    function getSuspendedCache() {
      var cacheFromPool = peekCacheFromPool();
      return null === cacheFromPool ? null : { parent: CacheContext._currentValue, pool: cacheFromPool };
    }
    var SuspenseException = Error(formatProdErrorMessage(460));
    var SuspenseyCommitException = Error(formatProdErrorMessage(474));
    var SuspenseActionException = Error(formatProdErrorMessage(542));
    var noopSuspenseyCommitThenable = { then: function() {
    } };
    function isThenableResolved(thenable) {
      thenable = thenable.status;
      return "fulfilled" === thenable || "rejected" === thenable;
    }
    function trackUsedThenable(thenableState2, thenable, index2) {
      index2 = thenableState2[index2];
      void 0 === index2 ? thenableState2.push(thenable) : index2 !== thenable && (thenable.then(noop$1, noop$1), thenable = index2);
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          thenableState2 = thenable.reason;
          checkIfUseWrappedInAsyncCatch(thenableState2);
          if (void 0 === thenableState2 && !("reason" in thenable))
            throw Error(formatProdErrorMessage(600));
          throw thenableState2;
        default:
          if ("string" === typeof thenable.status) thenable.then(noop$1, noop$1);
          else {
            thenableState2 = workInProgressRoot;
            if (null !== thenableState2 && 100 < thenableState2.shellSuspendCounter)
              throw Error(formatProdErrorMessage(482));
            thenableState2 = thenable;
            thenableState2.status = "pending";
            thenableState2.then(
              function(fulfilledValue) {
                if ("pending" === thenable.status) {
                  var fulfilledThenable = thenable;
                  fulfilledThenable.status = "fulfilled";
                  fulfilledThenable.value = fulfilledValue;
                }
              },
              function(error) {
                if ("pending" === thenable.status) {
                  var rejectedThenable = thenable;
                  rejectedThenable.status = "rejected";
                  rejectedThenable.reason = error;
                }
              }
            );
          }
          switch (thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenableState2 = thenable.reason, checkIfUseWrappedInAsyncCatch(thenableState2), thenableState2;
          }
          suspendedThenable = thenable;
          throw SuspenseException;
      }
    }
    function resolveLazy(lazyType) {
      try {
        var init = lazyType._init;
        return init(lazyType._payload);
      } catch (x) {
        if (null !== x && "object" === typeof x && "function" === typeof x.then)
          throw suspendedThenable = x, SuspenseException;
        throw x;
      }
    }
    var suspendedThenable = null;
    function getSuspendedThenable() {
      if (null === suspendedThenable) throw Error(formatProdErrorMessage(459));
      var thenable = suspendedThenable;
      suspendedThenable = null;
      return thenable;
    }
    function checkIfUseWrappedInAsyncCatch(rejectedReason) {
      if (rejectedReason === SuspenseException || rejectedReason === SuspenseActionException)
        throw Error(formatProdErrorMessage(483));
    }
    var thenableState$1 = null;
    var thenableIndexCounter$1 = 0;
    function unwrapThenable(thenable) {
      var index2 = thenableIndexCounter$1;
      thenableIndexCounter$1 += 1;
      null === thenableState$1 && (thenableState$1 = []);
      return trackUsedThenable(thenableState$1, thenable, index2);
    }
    function coerceRef(workInProgress2, element) {
      element = element.props.ref;
      workInProgress2.ref = void 0 !== element ? element : null;
    }
    function throwOnInvalidObjectTypeImpl(returnFiber, newChild) {
      if (newChild.$$typeof === REACT_LEGACY_ELEMENT_TYPE)
        throw Error(formatProdErrorMessage(525));
      returnFiber = Object.prototype.toString.call(newChild);
      throw Error(
        formatProdErrorMessage(
          31,
          "[object Object]" === returnFiber ? "object with keys {" + Object.keys(newChild).join(", ") + "}" : returnFiber
        )
      );
    }
    function createChildReconciler(shouldTrackSideEffects) {
      function deleteChild(returnFiber, childToDelete) {
        if (shouldTrackSideEffects) {
          var deletions = returnFiber.deletions;
          null === deletions ? (returnFiber.deletions = [childToDelete], returnFiber.flags |= 16) : deletions.push(childToDelete);
        }
      }
      function deleteRemainingChildren(returnFiber, currentFirstChild) {
        if (!shouldTrackSideEffects) return null;
        for (; null !== currentFirstChild; )
          deleteChild(returnFiber, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
        return null;
      }
      function mapRemainingChildren(currentFirstChild) {
        for (var existingChildren = /* @__PURE__ */ new Map(); null !== currentFirstChild; )
          null === currentFirstChild.key ? existingChildren.set(currentFirstChild.index, currentFirstChild) : existingChildren.set(currentFirstChild.key, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
        return existingChildren;
      }
      function useFiber(fiber, pendingProps) {
        fiber = createWorkInProgress(fiber, pendingProps);
        fiber.index = 0;
        fiber.sibling = null;
        return fiber;
      }
      function placeChild(newFiber, lastPlacedIndex, newIndex) {
        newFiber.index = newIndex;
        if (!shouldTrackSideEffects)
          return newFiber.flags |= 1048576, lastPlacedIndex;
        newIndex = newFiber.alternate;
        if (null !== newIndex)
          return newIndex = newIndex.index, newIndex < lastPlacedIndex ? (newFiber.flags |= 2, lastPlacedIndex) : newIndex;
        newFiber.flags |= 134217730;
        return lastPlacedIndex;
      }
      function placeSingleChild(newFiber) {
        shouldTrackSideEffects && null === newFiber.alternate && (newFiber.flags |= 134217730);
        return newFiber;
      }
      function updateTextNode(returnFiber, current2, textContent, lanes) {
        if (null === current2 || 6 !== current2.tag)
          return current2 = createFiberFromText(textContent, returnFiber.mode, lanes), current2.return = returnFiber, current2;
        current2 = useFiber(current2, textContent);
        current2.return = returnFiber;
        return current2;
      }
      function updateElement(returnFiber, current2, element, lanes) {
        var elementType = element.type;
        if (elementType === REACT_FRAGMENT_TYPE)
          return returnFiber = updateFragment(
            returnFiber,
            current2,
            element.props.children,
            lanes,
            element.key
          ), coerceRef(returnFiber, element), returnFiber;
        if (null !== current2 && (current2.elementType === elementType || "object" === typeof elementType && null !== elementType && elementType.$$typeof === REACT_LAZY_TYPE && resolveLazy(elementType) === current2.type))
          return current2 = useFiber(current2, element.props), coerceRef(current2, element), current2.return = returnFiber, current2;
        current2 = createFiberFromTypeAndProps(
          element.type,
          element.key,
          element.props,
          null,
          returnFiber.mode,
          lanes
        );
        coerceRef(current2, element);
        current2.return = returnFiber;
        return current2;
      }
      function updatePortal(returnFiber, current2, portal, lanes) {
        if (null === current2 || 4 !== current2.tag || current2.stateNode.containerInfo !== portal.containerInfo || current2.stateNode.implementation !== portal.implementation)
          return current2 = createFiberFromPortal(portal, returnFiber.mode, lanes), current2.return = returnFiber, current2;
        current2 = useFiber(current2, portal.children || []);
        current2.return = returnFiber;
        return current2;
      }
      function updateFragment(returnFiber, current2, fragment, lanes, key2) {
        if (null === current2 || 7 !== current2.tag)
          return current2 = createFiberFromFragment(
            fragment,
            returnFiber.mode,
            lanes,
            key2
          ), current2.return = returnFiber, current2;
        current2 = useFiber(current2, fragment);
        current2.return = returnFiber;
        return current2;
      }
      function createChild(returnFiber, newChild, lanes) {
        if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
          return newChild = createFiberFromText(
            "" + newChild,
            returnFiber.mode,
            lanes
          ), newChild.return = returnFiber, newChild;
        if ("object" === typeof newChild && null !== newChild) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              return lanes = createFiberFromTypeAndProps(
                newChild.type,
                newChild.key,
                newChild.props,
                null,
                returnFiber.mode,
                lanes
              ), coerceRef(lanes, newChild), lanes.return = returnFiber, lanes;
            case REACT_PORTAL_TYPE:
              return newChild = createFiberFromPortal(
                newChild,
                returnFiber.mode,
                lanes
              ), newChild.return = returnFiber, newChild;
            case REACT_LAZY_TYPE:
              return newChild = resolveLazy(newChild), createChild(returnFiber, newChild, lanes);
          }
          if (isArrayImpl(newChild) || getIteratorFn(newChild))
            return newChild = createFiberFromFragment(
              newChild,
              returnFiber.mode,
              lanes,
              null
            ), newChild.return = returnFiber, newChild;
          if ("function" === typeof newChild.then)
            return createChild(returnFiber, unwrapThenable(newChild), lanes);
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return createChild(
              returnFiber,
              readContextDuringReconciliation(returnFiber, newChild),
              lanes
            );
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return null;
      }
      function updateSlot(returnFiber, oldFiber, newChild, lanes) {
        var key2 = null !== oldFiber ? oldFiber.key : null;
        if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
          return null !== key2 ? null : updateTextNode(returnFiber, oldFiber, "" + newChild, lanes);
        if ("object" === typeof newChild && null !== newChild) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              return newChild.key === key2 ? updateElement(returnFiber, oldFiber, newChild, lanes) : null;
            case REACT_PORTAL_TYPE:
              return newChild.key === key2 ? updatePortal(returnFiber, oldFiber, newChild, lanes) : null;
            case REACT_LAZY_TYPE:
              return newChild = resolveLazy(newChild), updateSlot(returnFiber, oldFiber, newChild, lanes);
          }
          if (isArrayImpl(newChild) || getIteratorFn(newChild))
            return null !== key2 ? null : updateFragment(returnFiber, oldFiber, newChild, lanes, null);
          if ("function" === typeof newChild.then)
            return updateSlot(
              returnFiber,
              oldFiber,
              unwrapThenable(newChild),
              lanes
            );
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return updateSlot(
              returnFiber,
              oldFiber,
              readContextDuringReconciliation(returnFiber, newChild),
              lanes
            );
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return null;
      }
      function updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes) {
        if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
          return existingChildren = existingChildren.get(newIdx) || null, updateTextNode(returnFiber, existingChildren, "" + newChild, lanes);
        if ("object" === typeof newChild && null !== newChild) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              return existingChildren = existingChildren.get(
                null === newChild.key ? newIdx : newChild.key
              ) || null, updateElement(returnFiber, existingChildren, newChild, lanes);
            case REACT_PORTAL_TYPE:
              return existingChildren = existingChildren.get(
                null === newChild.key ? newIdx : newChild.key
              ) || null, updatePortal(returnFiber, existingChildren, newChild, lanes);
            case REACT_LAZY_TYPE:
              return newChild = resolveLazy(newChild), updateFromMap(
                existingChildren,
                returnFiber,
                newIdx,
                newChild,
                lanes
              );
          }
          if (isArrayImpl(newChild) || getIteratorFn(newChild))
            return existingChildren = existingChildren.get(newIdx) || null, updateFragment(returnFiber, existingChildren, newChild, lanes, null);
          if ("function" === typeof newChild.then)
            return updateFromMap(
              existingChildren,
              returnFiber,
              newIdx,
              unwrapThenable(newChild),
              lanes
            );
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return updateFromMap(
              existingChildren,
              returnFiber,
              newIdx,
              readContextDuringReconciliation(returnFiber, newChild),
              lanes
            );
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return null;
      }
      function reconcileChildrenArray(returnFiber, currentFirstChild, newChildren, lanes) {
        for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null; null !== oldFiber && newIdx < newChildren.length; newIdx++) {
          oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
          var newFiber = updateSlot(
            returnFiber,
            oldFiber,
            newChildren[newIdx],
            lanes
          );
          if (null === newFiber) {
            null === oldFiber && (oldFiber = nextOldFiber);
            break;
          }
          shouldTrackSideEffects && oldFiber && null === newFiber.alternate && deleteChild(returnFiber, oldFiber);
          currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
          null === previousNewFiber ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
          previousNewFiber = newFiber;
          oldFiber = nextOldFiber;
        }
        if (newIdx === newChildren.length)
          return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
        if (null === oldFiber) {
          for (; newIdx < newChildren.length; newIdx++)
            oldFiber = createChild(returnFiber, newChildren[newIdx], lanes), null !== oldFiber && (currentFirstChild = placeChild(
              oldFiber,
              currentFirstChild,
              newIdx
            ), null === previousNewFiber ? resultingFirstChild = oldFiber : previousNewFiber.sibling = oldFiber, previousNewFiber = oldFiber);
          isHydrating && pushTreeFork(returnFiber, newIdx);
          return resultingFirstChild;
        }
        for (oldFiber = mapRemainingChildren(oldFiber); newIdx < newChildren.length; newIdx++)
          nextOldFiber = updateFromMap(
            oldFiber,
            returnFiber,
            newIdx,
            newChildren[newIdx],
            lanes
          ), null !== nextOldFiber && (shouldTrackSideEffects && (newFiber = nextOldFiber.alternate, null !== newFiber && oldFiber.delete(null === newFiber.key ? newIdx : newFiber.key)), currentFirstChild = placeChild(
            nextOldFiber,
            currentFirstChild,
            newIdx
          ), null === previousNewFiber ? resultingFirstChild = nextOldFiber : previousNewFiber.sibling = nextOldFiber, previousNewFiber = nextOldFiber);
        shouldTrackSideEffects && oldFiber.forEach(function(child) {
          return deleteChild(returnFiber, child);
        });
        isHydrating && pushTreeFork(returnFiber, newIdx);
        return resultingFirstChild;
      }
      function reconcileChildrenIterator(returnFiber, currentFirstChild, newChildren, lanes) {
        if (null == newChildren) throw Error(formatProdErrorMessage(151));
        for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null, step = newChildren.next(); null !== oldFiber && !step.done; newIdx++, step = newChildren.next()) {
          oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
          var newFiber = updateSlot(returnFiber, oldFiber, step.value, lanes);
          if (null === newFiber) {
            null === oldFiber && (oldFiber = nextOldFiber);
            break;
          }
          shouldTrackSideEffects && oldFiber && null === newFiber.alternate && deleteChild(returnFiber, oldFiber);
          currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
          null === previousNewFiber ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
          previousNewFiber = newFiber;
          oldFiber = nextOldFiber;
        }
        if (step.done)
          return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
        if (null === oldFiber) {
          for (; !step.done; newIdx++, step = newChildren.next())
            step = createChild(returnFiber, step.value, lanes), null !== step && (currentFirstChild = placeChild(step, currentFirstChild, newIdx), null === previousNewFiber ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
          isHydrating && pushTreeFork(returnFiber, newIdx);
          return resultingFirstChild;
        }
        for (oldFiber = mapRemainingChildren(oldFiber); !step.done; newIdx++, step = newChildren.next())
          step = updateFromMap(oldFiber, returnFiber, newIdx, step.value, lanes), null !== step && (shouldTrackSideEffects && (nextOldFiber = step.alternate, null !== nextOldFiber && oldFiber.delete(
            null === nextOldFiber.key ? newIdx : nextOldFiber.key
          )), currentFirstChild = placeChild(step, currentFirstChild, newIdx), null === previousNewFiber ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
        shouldTrackSideEffects && oldFiber.forEach(function(child) {
          return deleteChild(returnFiber, child);
        });
        isHydrating && pushTreeFork(returnFiber, newIdx);
        return resultingFirstChild;
      }
      function reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes) {
        "object" === typeof newChild && null !== newChild && newChild.type === REACT_FRAGMENT_TYPE && null === newChild.key && void 0 === newChild.props.ref && (newChild = newChild.props.children);
        if ("object" === typeof newChild && null !== newChild) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              a: {
                for (var key2 = newChild.key; null !== currentFirstChild; ) {
                  if (currentFirstChild.key === key2) {
                    key2 = newChild.type;
                    if (key2 === REACT_FRAGMENT_TYPE) {
                      if (7 === currentFirstChild.tag) {
                        deleteRemainingChildren(
                          returnFiber,
                          currentFirstChild.sibling
                        );
                        lanes = useFiber(
                          currentFirstChild,
                          newChild.props.children
                        );
                        coerceRef(lanes, newChild);
                        lanes.return = returnFiber;
                        returnFiber = lanes;
                        break a;
                      }
                    } else if (currentFirstChild.elementType === key2 || "object" === typeof key2 && null !== key2 && key2.$$typeof === REACT_LAZY_TYPE && resolveLazy(key2) === currentFirstChild.type) {
                      deleteRemainingChildren(
                        returnFiber,
                        currentFirstChild.sibling
                      );
                      lanes = useFiber(currentFirstChild, newChild.props);
                      coerceRef(lanes, newChild);
                      lanes.return = returnFiber;
                      returnFiber = lanes;
                      break a;
                    }
                    deleteRemainingChildren(returnFiber, currentFirstChild);
                    break;
                  } else deleteChild(returnFiber, currentFirstChild);
                  currentFirstChild = currentFirstChild.sibling;
                }
                newChild.type === REACT_FRAGMENT_TYPE ? (lanes = createFiberFromFragment(
                  newChild.props.children,
                  returnFiber.mode,
                  lanes,
                  newChild.key
                ), coerceRef(lanes, newChild), lanes.return = returnFiber, returnFiber = lanes) : (lanes = createFiberFromTypeAndProps(
                  newChild.type,
                  newChild.key,
                  newChild.props,
                  null,
                  returnFiber.mode,
                  lanes
                ), coerceRef(lanes, newChild), lanes.return = returnFiber, returnFiber = lanes);
              }
              return placeSingleChild(returnFiber);
            case REACT_PORTAL_TYPE:
              a: {
                for (key2 = newChild.key; null !== currentFirstChild; ) {
                  if (currentFirstChild.key === key2)
                    if (4 === currentFirstChild.tag && currentFirstChild.stateNode.containerInfo === newChild.containerInfo && currentFirstChild.stateNode.implementation === newChild.implementation) {
                      deleteRemainingChildren(
                        returnFiber,
                        currentFirstChild.sibling
                      );
                      lanes = useFiber(currentFirstChild, newChild.children || []);
                      lanes.return = returnFiber;
                      returnFiber = lanes;
                      break a;
                    } else {
                      deleteRemainingChildren(returnFiber, currentFirstChild);
                      break;
                    }
                  else deleteChild(returnFiber, currentFirstChild);
                  currentFirstChild = currentFirstChild.sibling;
                }
                lanes = createFiberFromPortal(newChild, returnFiber.mode, lanes);
                lanes.return = returnFiber;
                returnFiber = lanes;
              }
              return placeSingleChild(returnFiber);
            case REACT_LAZY_TYPE:
              return newChild = resolveLazy(newChild), reconcileChildFibersImpl(
                returnFiber,
                currentFirstChild,
                newChild,
                lanes
              );
          }
          if (isArrayImpl(newChild))
            return reconcileChildrenArray(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes
            );
          if (getIteratorFn(newChild)) {
            key2 = getIteratorFn(newChild);
            if ("function" !== typeof key2) throw Error(formatProdErrorMessage(150));
            newChild = key2.call(newChild);
            return reconcileChildrenIterator(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes
            );
          }
          if ("function" === typeof newChild.then)
            return reconcileChildFibersImpl(
              returnFiber,
              currentFirstChild,
              unwrapThenable(newChild),
              lanes
            );
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return reconcileChildFibersImpl(
              returnFiber,
              currentFirstChild,
              readContextDuringReconciliation(returnFiber, newChild),
              lanes
            );
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return "string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild ? (newChild = "" + newChild, null !== currentFirstChild && 6 === currentFirstChild.tag ? (deleteRemainingChildren(returnFiber, currentFirstChild.sibling), lanes = useFiber(currentFirstChild, newChild), lanes.return = returnFiber, returnFiber = lanes) : (deleteRemainingChildren(returnFiber, currentFirstChild), lanes = createFiberFromText(newChild, returnFiber.mode, lanes), lanes.return = returnFiber, returnFiber = lanes), placeSingleChild(returnFiber)) : deleteRemainingChildren(returnFiber, currentFirstChild);
      }
      return function(returnFiber, currentFirstChild, newChild, lanes) {
        try {
          thenableIndexCounter$1 = 0;
          var firstChildFiber = reconcileChildFibersImpl(
            returnFiber,
            currentFirstChild,
            newChild,
            lanes
          );
          thenableState$1 = null;
          return firstChildFiber;
        } catch (x) {
          if (x === SuspenseException || x === SuspenseActionException) throw x;
          var fiber = createFiberImplClass(29, x, null, returnFiber.mode);
          fiber.lanes = lanes;
          fiber.return = returnFiber;
          return fiber;
        } finally {
        }
      };
    }
    var reconcileChildFibers = createChildReconciler(true);
    var mountChildFibers = createChildReconciler(false);
    var hasForceUpdate = false;
    function initializeUpdateQueue(fiber) {
      fiber.updateQueue = {
        baseState: fiber.memoizedState,
        firstBaseUpdate: null,
        lastBaseUpdate: null,
        shared: { pending: null, lanes: 0, hiddenCallbacks: null },
        callbacks: null
      };
    }
    function cloneUpdateQueue(current2, workInProgress2) {
      current2 = current2.updateQueue;
      workInProgress2.updateQueue === current2 && (workInProgress2.updateQueue = {
        baseState: current2.baseState,
        firstBaseUpdate: current2.firstBaseUpdate,
        lastBaseUpdate: current2.lastBaseUpdate,
        shared: current2.shared,
        callbacks: null
      });
    }
    function createUpdate(lane) {
      return { lane, tag: 0, payload: null, callback: null, next: null };
    }
    function enqueueUpdate(fiber, update, lane) {
      var updateQueue = fiber.updateQueue;
      if (null === updateQueue) return null;
      updateQueue = updateQueue.shared;
      if (0 !== (executionContext & 2)) {
        var pending = updateQueue.pending;
        null === pending ? update.next = update : (update.next = pending.next, pending.next = update);
        updateQueue.pending = update;
        update = getRootForUpdatedFiber(fiber);
        markUpdateLaneFromFiberToRoot(fiber, null, lane);
        return update;
      }
      enqueueUpdate$1(fiber, updateQueue, update, lane);
      return getRootForUpdatedFiber(fiber);
    }
    function entangleTransitions(root2, fiber, lane) {
      fiber = fiber.updateQueue;
      if (null !== fiber && (fiber = fiber.shared, 0 !== (lane & 4194048))) {
        var queueLanes = fiber.lanes;
        queueLanes &= root2.pendingLanes;
        lane |= queueLanes;
        fiber.lanes = lane;
        markRootEntangled(root2, lane);
      }
    }
    function enqueueCapturedUpdate(workInProgress2, capturedUpdate) {
      var queue = workInProgress2.updateQueue, current2 = workInProgress2.alternate;
      if (null !== current2 && (current2 = current2.updateQueue, queue === current2)) {
        var newFirst = null, newLast = null;
        queue = queue.firstBaseUpdate;
        if (null !== queue) {
          do {
            var clone = {
              lane: queue.lane,
              tag: queue.tag,
              payload: queue.payload,
              callback: null,
              next: null
            };
            null === newLast ? newFirst = newLast = clone : newLast = newLast.next = clone;
            queue = queue.next;
          } while (null !== queue);
          null === newLast ? newFirst = newLast = capturedUpdate : newLast = newLast.next = capturedUpdate;
        } else newFirst = newLast = capturedUpdate;
        queue = {
          baseState: current2.baseState,
          firstBaseUpdate: newFirst,
          lastBaseUpdate: newLast,
          shared: current2.shared,
          callbacks: current2.callbacks
        };
        workInProgress2.updateQueue = queue;
        return;
      }
      workInProgress2 = queue.lastBaseUpdate;
      null === workInProgress2 ? queue.firstBaseUpdate = capturedUpdate : workInProgress2.next = capturedUpdate;
      queue.lastBaseUpdate = capturedUpdate;
    }
    var didReadFromEntangledAsyncAction = false;
    function suspendIfUpdateReadFromEntangledAsyncAction() {
      if (didReadFromEntangledAsyncAction) {
        var entangledActionThenable = currentEntangledActionThenable;
        if (null !== entangledActionThenable) throw entangledActionThenable;
      }
    }
    function processUpdateQueue(workInProgress$jscomp$0, props, instance$jscomp$0, renderLanes2) {
      didReadFromEntangledAsyncAction = false;
      var queue = workInProgress$jscomp$0.updateQueue;
      hasForceUpdate = false;
      var firstBaseUpdate = queue.firstBaseUpdate, lastBaseUpdate = queue.lastBaseUpdate, pendingQueue = queue.shared.pending;
      if (null !== pendingQueue) {
        queue.shared.pending = null;
        var lastPendingUpdate = pendingQueue, firstPendingUpdate = lastPendingUpdate.next;
        lastPendingUpdate.next = null;
        null === lastBaseUpdate ? firstBaseUpdate = firstPendingUpdate : lastBaseUpdate.next = firstPendingUpdate;
        lastBaseUpdate = lastPendingUpdate;
        var current2 = workInProgress$jscomp$0.alternate;
        null !== current2 && (current2 = current2.updateQueue, pendingQueue = current2.lastBaseUpdate, pendingQueue !== lastBaseUpdate && (null === pendingQueue ? current2.firstBaseUpdate = firstPendingUpdate : pendingQueue.next = firstPendingUpdate, current2.lastBaseUpdate = lastPendingUpdate));
      }
      if (null !== firstBaseUpdate) {
        var newState = queue.baseState;
        lastBaseUpdate = 0;
        current2 = firstPendingUpdate = lastPendingUpdate = null;
        pendingQueue = firstBaseUpdate;
        do {
          var updateLane = pendingQueue.lane & -536870913, isHiddenUpdate = updateLane !== pendingQueue.lane;
          if (isHiddenUpdate ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes2 & updateLane) === updateLane) {
            0 !== updateLane && updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction = true);
            null !== current2 && (current2 = current2.next = {
              lane: 0,
              tag: pendingQueue.tag,
              payload: pendingQueue.payload,
              callback: null,
              next: null
            });
            a: {
              var workInProgress2 = workInProgress$jscomp$0, update = pendingQueue;
              updateLane = props;
              var instance = instance$jscomp$0;
              switch (update.tag) {
                case 1:
                  workInProgress2 = update.payload;
                  if ("function" === typeof workInProgress2) {
                    newState = workInProgress2.call(instance, newState, updateLane);
                    break a;
                  }
                  newState = workInProgress2;
                  break a;
                case 3:
                  workInProgress2.flags = workInProgress2.flags & -65537 | 128;
                case 0:
                  workInProgress2 = update.payload;
                  updateLane = "function" === typeof workInProgress2 ? workInProgress2.call(instance, newState, updateLane) : workInProgress2;
                  if (null === updateLane || void 0 === updateLane) break a;
                  newState = assign({}, newState, updateLane);
                  break a;
                case 2:
                  hasForceUpdate = true;
              }
            }
            updateLane = pendingQueue.callback;
            null !== updateLane && (workInProgress$jscomp$0.flags |= 64, isHiddenUpdate && (workInProgress$jscomp$0.flags |= 8192), isHiddenUpdate = queue.callbacks, null === isHiddenUpdate ? queue.callbacks = [updateLane] : isHiddenUpdate.push(updateLane));
          } else
            isHiddenUpdate = {
              lane: updateLane,
              tag: pendingQueue.tag,
              payload: pendingQueue.payload,
              callback: pendingQueue.callback,
              next: null
            }, null === current2 ? (firstPendingUpdate = current2 = isHiddenUpdate, lastPendingUpdate = newState) : current2 = current2.next = isHiddenUpdate, lastBaseUpdate |= updateLane;
          pendingQueue = pendingQueue.next;
          if (null === pendingQueue)
            if (pendingQueue = queue.shared.pending, null === pendingQueue)
              break;
            else
              isHiddenUpdate = pendingQueue, pendingQueue = isHiddenUpdate.next, isHiddenUpdate.next = null, queue.lastBaseUpdate = isHiddenUpdate, queue.shared.pending = null;
        } while (1);
        null === current2 && (lastPendingUpdate = newState);
        queue.baseState = lastPendingUpdate;
        queue.firstBaseUpdate = firstPendingUpdate;
        queue.lastBaseUpdate = current2;
        null === firstBaseUpdate && (queue.shared.lanes = 0);
        workInProgressRootSkippedLanes |= lastBaseUpdate;
        workInProgress$jscomp$0.lanes = lastBaseUpdate;
        workInProgress$jscomp$0.memoizedState = newState;
      }
    }
    function callCallback(callback, context) {
      if ("function" !== typeof callback)
        throw Error(formatProdErrorMessage(191, callback));
      callback.call(context);
    }
    function commitCallbacks(updateQueue, context) {
      var callbacks = updateQueue.callbacks;
      if (null !== callbacks)
        for (updateQueue.callbacks = null, updateQueue = 0; updateQueue < callbacks.length; updateQueue++)
          callCallback(callbacks[updateQueue], context);
    }
    var currentTreeHiddenStackCursor = createCursor(null);
    var prevEntangledRenderLanesCursor = createCursor(0);
    function pushHiddenContext(fiber, context) {
      fiber = entangledRenderLanes;
      push(prevEntangledRenderLanesCursor, fiber);
      push(currentTreeHiddenStackCursor, context);
      entangledRenderLanes = fiber | context.baseLanes;
    }
    function reuseHiddenContextOnStack() {
      push(prevEntangledRenderLanesCursor, entangledRenderLanes);
      push(currentTreeHiddenStackCursor, currentTreeHiddenStackCursor.current);
    }
    function popHiddenContext() {
      entangledRenderLanes = prevEntangledRenderLanesCursor.current;
      pop(currentTreeHiddenStackCursor);
      pop(prevEntangledRenderLanesCursor);
    }
    var suspenseHandlerStackCursor = createCursor(null);
    var shellBoundary = null;
    function pushPrimaryTreeSuspenseHandler(handler) {
      var current2 = handler.alternate;
      push(suspenseStackCursor, suspenseStackCursor.current & 1);
      push(suspenseHandlerStackCursor, handler);
      null === shellBoundary && (null === current2 || null !== currentTreeHiddenStackCursor.current ? shellBoundary = handler : null !== current2.memoizedState && (shellBoundary = handler));
    }
    function pushDehydratedActivitySuspenseHandler(fiber) {
      push(suspenseStackCursor, suspenseStackCursor.current);
      push(suspenseHandlerStackCursor, fiber);
      null === shellBoundary && (shellBoundary = fiber);
    }
    function pushOffscreenSuspenseHandler(fiber) {
      22 === fiber.tag ? (push(suspenseStackCursor, suspenseStackCursor.current), push(suspenseHandlerStackCursor, fiber), null === shellBoundary && (shellBoundary = fiber)) : reuseSuspenseHandlerOnStack();
    }
    function reuseSuspenseHandlerOnStack() {
      push(suspenseStackCursor, suspenseStackCursor.current);
      push(suspenseHandlerStackCursor, suspenseHandlerStackCursor.current);
    }
    function popSuspenseHandler(fiber) {
      pop(suspenseHandlerStackCursor);
      shellBoundary === fiber && (shellBoundary = null);
      pop(suspenseStackCursor);
    }
    var suspenseStackCursor = createCursor(0);
    function pushSuspenseListContext(fiber, newContext) {
      push(suspenseHandlerStackCursor, suspenseHandlerStackCursor.current);
      push(suspenseStackCursor, newContext);
    }
    function popSuspenseListContext(fiber) {
      pop(suspenseStackCursor);
      pop(suspenseHandlerStackCursor);
      shellBoundary === fiber && (shellBoundary = null);
    }
    function findFirstSuspended(row) {
      for (var node = row; null !== node; ) {
        if (13 === node.tag) {
          var state = node.memoizedState;
          if (null !== state && (state = state.dehydrated, null === state || isSuspenseInstancePending(state) || isSuspenseInstanceFallback(state)))
            return node;
        } else if (19 === node.tag && "independent" !== node.memoizedProps.revealOrder) {
          if (0 !== (node.flags & 128)) return node;
        } else if (null !== node.child) {
          node.child.return = node;
          node = node.child;
          continue;
        }
        if (node === row) break;
        for (; null === node.sibling; ) {
          if (null === node.return || node.return === row) return null;
          node = node.return;
        }
        node.sibling.return = node.return;
        node = node.sibling;
      }
      return null;
    }
    var renderLanes = 0;
    var currentlyRenderingFiber = null;
    var currentHook = null;
    var workInProgressHook = null;
    var didScheduleRenderPhaseUpdate = false;
    var didScheduleRenderPhaseUpdateDuringThisPass = false;
    var shouldDoubleInvokeUserFnsInHooksDEV = false;
    var localIdCounter = 0;
    var thenableIndexCounter = 0;
    var thenableState = null;
    var globalClientIdCounter = 0;
    function throwInvalidHookError() {
      throw Error(formatProdErrorMessage(321));
    }
    function areHookInputsEqual(nextDeps, prevDeps) {
      if (null === prevDeps) return false;
      for (var i = 0; i < prevDeps.length && i < nextDeps.length; i++)
        if (!objectIs(nextDeps[i], prevDeps[i])) return false;
      return true;
    }
    function renderWithHooks(current2, workInProgress2, Component, props, secondArg, nextRenderLanes) {
      renderLanes = nextRenderLanes;
      currentlyRenderingFiber = workInProgress2;
      workInProgress2.memoizedState = null;
      workInProgress2.updateQueue = null;
      workInProgress2.lanes = 0;
      ReactSharedInternals.H = null === current2 || null === current2.memoizedState ? HooksDispatcherOnMount : HooksDispatcherOnUpdate;
      shouldDoubleInvokeUserFnsInHooksDEV = false;
      nextRenderLanes = Component(props, secondArg);
      shouldDoubleInvokeUserFnsInHooksDEV = false;
      didScheduleRenderPhaseUpdateDuringThisPass && (nextRenderLanes = renderWithHooksAgain(
        workInProgress2,
        Component,
        props,
        secondArg
      ));
      finishRenderingHooks(current2);
      return nextRenderLanes;
    }
    function finishRenderingHooks(current2) {
      ReactSharedInternals.H = ContextOnlyDispatcher;
      var didRenderTooFewHooks = null !== currentHook && null !== currentHook.next;
      renderLanes = 0;
      workInProgressHook = currentHook = currentlyRenderingFiber = null;
      didScheduleRenderPhaseUpdate = false;
      thenableIndexCounter = 0;
      thenableState = null;
      if (didRenderTooFewHooks) throw Error(formatProdErrorMessage(300));
      null === current2 || didReceiveUpdate || (current2 = current2.dependencies, null !== current2 && checkIfContextChanged(current2) && (didReceiveUpdate = true));
    }
    function renderWithHooksAgain(workInProgress2, Component, props, secondArg) {
      currentlyRenderingFiber = workInProgress2;
      var numberOfReRenders = 0;
      do {
        didScheduleRenderPhaseUpdateDuringThisPass && (thenableState = null);
        thenableIndexCounter = 0;
        didScheduleRenderPhaseUpdateDuringThisPass = false;
        if (25 <= numberOfReRenders) throw Error(formatProdErrorMessage(301));
        numberOfReRenders += 1;
        workInProgressHook = currentHook = null;
        if (null != workInProgress2.updateQueue) {
          var children = workInProgress2.updateQueue;
          children.lastEffect = null;
          children.events = null;
          children.stores = null;
          null != children.memoCache && (children.memoCache.index = 0);
        }
        ReactSharedInternals.H = HooksDispatcherOnRerender;
        children = Component(props, secondArg);
      } while (didScheduleRenderPhaseUpdateDuringThisPass);
      return children;
    }
    function TransitionAwareHostComponent() {
      var dispatcher = ReactSharedInternals.H, maybeThenable = dispatcher.useState()[0];
      maybeThenable = "function" === typeof maybeThenable.then ? useThenable(maybeThenable) : maybeThenable;
      dispatcher = dispatcher.useState()[0];
      (null !== currentHook ? currentHook.memoizedState : null) !== dispatcher && (currentlyRenderingFiber.flags |= 1024);
      return maybeThenable;
    }
    function checkDidRenderIdHook() {
      var didRenderIdHook = 0 !== localIdCounter;
      localIdCounter = 0;
      return didRenderIdHook;
    }
    function bailoutHooks(current2, workInProgress2, lanes) {
      workInProgress2.updateQueue = current2.updateQueue;
      workInProgress2.flags &= -2053;
      current2.lanes &= ~lanes;
    }
    function resetHooksOnUnwind(workInProgress2) {
      if (didScheduleRenderPhaseUpdate) {
        for (workInProgress2 = workInProgress2.memoizedState; null !== workInProgress2; ) {
          var queue = workInProgress2.queue;
          null !== queue && (queue.pending = null);
          workInProgress2 = workInProgress2.next;
        }
        didScheduleRenderPhaseUpdate = false;
      }
      renderLanes = 0;
      workInProgressHook = currentHook = currentlyRenderingFiber = null;
      didScheduleRenderPhaseUpdateDuringThisPass = false;
      thenableIndexCounter = localIdCounter = 0;
      thenableState = null;
    }
    function mountWorkInProgressHook() {
      var hook = {
        memoizedState: null,
        baseState: null,
        baseQueue: null,
        queue: null,
        next: null
      };
      null === workInProgressHook ? currentlyRenderingFiber.memoizedState = workInProgressHook = hook : workInProgressHook = workInProgressHook.next = hook;
      return workInProgressHook;
    }
    function updateWorkInProgressHook() {
      if (null === currentHook) {
        var nextCurrentHook = currentlyRenderingFiber.alternate;
        nextCurrentHook = null !== nextCurrentHook ? nextCurrentHook.memoizedState : null;
      } else nextCurrentHook = currentHook.next;
      var nextWorkInProgressHook = null === workInProgressHook ? currentlyRenderingFiber.memoizedState : workInProgressHook.next;
      if (null !== nextWorkInProgressHook)
        workInProgressHook = nextWorkInProgressHook, currentHook = nextCurrentHook;
      else {
        if (null === nextCurrentHook) {
          if (null === currentlyRenderingFiber.alternate)
            throw Error(formatProdErrorMessage(467));
          throw Error(formatProdErrorMessage(310));
        }
        currentHook = nextCurrentHook;
        nextCurrentHook = {
          memoizedState: currentHook.memoizedState,
          baseState: currentHook.baseState,
          baseQueue: currentHook.baseQueue,
          queue: currentHook.queue,
          next: null
        };
        null === workInProgressHook ? currentlyRenderingFiber.memoizedState = workInProgressHook = nextCurrentHook : workInProgressHook = workInProgressHook.next = nextCurrentHook;
      }
      return workInProgressHook;
    }
    function createFunctionComponentUpdateQueue() {
      return { lastEffect: null, events: null, stores: null, memoCache: null };
    }
    function useThenable(thenable) {
      var index2 = thenableIndexCounter;
      thenableIndexCounter += 1;
      null === thenableState && (thenableState = []);
      thenable = trackUsedThenable(thenableState, thenable, index2);
      index2 = currentlyRenderingFiber;
      null === (null === workInProgressHook ? index2.memoizedState : workInProgressHook.next) && (index2 = index2.alternate, ReactSharedInternals.H = null === index2 || null === index2.memoizedState ? HooksDispatcherOnMount : HooksDispatcherOnUpdate);
      return thenable;
    }
    function use(usable) {
      if (null !== usable && "object" === typeof usable) {
        if ("function" === typeof usable.then) return useThenable(usable);
        if (usable.$$typeof === REACT_RECOVERABLE_TYPE) return;
        if (usable.$$typeof === REACT_CONTEXT_TYPE) return readContext(usable);
      }
      throw Error(formatProdErrorMessage(438, String(usable)));
    }
    function useMemoCache(size) {
      var memoCache = null, updateQueue = currentlyRenderingFiber.updateQueue;
      null !== updateQueue && (memoCache = updateQueue.memoCache);
      if (null == memoCache) {
        var current2 = currentlyRenderingFiber.alternate;
        null !== current2 && (current2 = current2.updateQueue, null !== current2 && (current2 = current2.memoCache, null != current2 && (memoCache = {
          data: current2.data.map(function(array) {
            return array.slice();
          }),
          index: 0
        })));
      }
      null == memoCache && (memoCache = { data: [], index: 0 });
      null === updateQueue && (updateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = updateQueue);
      updateQueue.memoCache = memoCache;
      updateQueue = memoCache.data[memoCache.index];
      if (void 0 === updateQueue)
        for (updateQueue = memoCache.data[memoCache.index] = Array(size), current2 = 0; current2 < size; current2++)
          updateQueue[current2] = REACT_MEMO_CACHE_SENTINEL;
      memoCache.index++;
      return updateQueue;
    }
    function basicStateReducer(state, action) {
      return "function" === typeof action ? action(state) : action;
    }
    function updateReducer(reducer) {
      var hook = updateWorkInProgressHook();
      return updateReducerImpl(hook, currentHook, reducer);
    }
    function updateReducerImpl(hook, current2, reducer) {
      var queue = hook.queue;
      if (null === queue) throw Error(formatProdErrorMessage(311));
      queue.lastRenderedReducer = reducer;
      var baseQueue = hook.baseQueue, pendingQueue = queue.pending;
      if (null !== pendingQueue) {
        if (null !== baseQueue) {
          var baseFirst = baseQueue.next;
          baseQueue.next = pendingQueue.next;
          pendingQueue.next = baseFirst;
        }
        current2.baseQueue = baseQueue = pendingQueue;
        queue.pending = null;
      }
      pendingQueue = hook.baseState;
      if (null === baseQueue) hook.memoizedState = pendingQueue;
      else {
        current2 = baseQueue.next;
        var newBaseQueueFirst = baseFirst = null, newBaseQueueLast = null, update = current2, didReadFromEntangledAsyncAction$64 = false;
        do {
          var updateLane = update.lane & -536870913;
          if (updateLane !== update.lane ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes & updateLane) === updateLane) {
            var revertLane = update.revertLane;
            if (0 === revertLane)
              null !== newBaseQueueLast && (newBaseQueueLast = newBaseQueueLast.next = {
                lane: 0,
                revertLane: 0,
                gesture: null,
                action: update.action,
                hasEagerState: update.hasEagerState,
                eagerState: update.eagerState,
                next: null
              }), updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction$64 = true);
            else if ((renderLanes & revertLane) === revertLane) {
              update = update.next;
              revertLane === currentEntangledLane && (didReadFromEntangledAsyncAction$64 = true);
              continue;
            } else
              updateLane = {
                lane: 0,
                revertLane: update.revertLane,
                gesture: null,
                action: update.action,
                hasEagerState: update.hasEagerState,
                eagerState: update.eagerState,
                next: null
              }, null === newBaseQueueLast ? (newBaseQueueFirst = newBaseQueueLast = updateLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = updateLane, currentlyRenderingFiber.lanes |= revertLane, workInProgressRootSkippedLanes |= revertLane;
            updateLane = update.action;
            shouldDoubleInvokeUserFnsInHooksDEV && reducer(pendingQueue, updateLane);
            pendingQueue = update.hasEagerState ? update.eagerState : reducer(pendingQueue, updateLane);
          } else
            revertLane = {
              lane: updateLane,
              revertLane: update.revertLane,
              gesture: update.gesture,
              action: update.action,
              hasEagerState: update.hasEagerState,
              eagerState: update.eagerState,
              next: null
            }, null === newBaseQueueLast ? (newBaseQueueFirst = newBaseQueueLast = revertLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = revertLane, currentlyRenderingFiber.lanes |= updateLane, workInProgressRootSkippedLanes |= updateLane;
          update = update.next;
        } while (null !== update && update !== current2);
        null === newBaseQueueLast ? baseFirst = pendingQueue : newBaseQueueLast.next = newBaseQueueFirst;
        if (!objectIs(pendingQueue, hook.memoizedState) && (didReceiveUpdate = true, didReadFromEntangledAsyncAction$64 && (reducer = currentEntangledActionThenable, null !== reducer)))
          throw reducer;
        hook.memoizedState = pendingQueue;
        hook.baseState = baseFirst;
        hook.baseQueue = newBaseQueueLast;
        queue.lastRenderedState = pendingQueue;
      }
      null === baseQueue && (queue.lanes = 0);
      return [hook.memoizedState, queue.dispatch];
    }
    function rerenderReducer(reducer) {
      var hook = updateWorkInProgressHook(), queue = hook.queue;
      if (null === queue) throw Error(formatProdErrorMessage(311));
      queue.lastRenderedReducer = reducer;
      var dispatch = queue.dispatch, lastRenderPhaseUpdate = queue.pending, newState = hook.memoizedState;
      if (null !== lastRenderPhaseUpdate) {
        queue.pending = null;
        var update = lastRenderPhaseUpdate = lastRenderPhaseUpdate.next;
        do
          newState = reducer(newState, update.action), update = update.next;
        while (update !== lastRenderPhaseUpdate);
        objectIs(newState, hook.memoizedState) || (didReceiveUpdate = true);
        hook.memoizedState = newState;
        null === hook.baseQueue && (hook.baseState = newState);
        queue.lastRenderedState = newState;
      }
      return [newState, dispatch];
    }
    function updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      var fiber = currentlyRenderingFiber, hook = updateWorkInProgressHook(), isHydrating$jscomp$0 = isHydrating;
      if (isHydrating$jscomp$0) {
        if (void 0 === getServerSnapshot) throw Error(formatProdErrorMessage(407));
        getServerSnapshot = getServerSnapshot();
      } else getServerSnapshot = getSnapshot();
      var snapshotChanged = !objectIs(
        (currentHook || hook).memoizedState,
        getServerSnapshot
      );
      snapshotChanged && (hook.memoizedState = getServerSnapshot, didReceiveUpdate = true);
      hook = hook.queue;
      updateEffect(subscribeToStore.bind(null, fiber, hook, subscribe), [
        subscribe
      ]);
      subscribe = hook.getSnapshot !== getSnapshot || snapshotChanged || null !== workInProgressHook && 0 !== (workInProgressHook.memoizedState.tag & 1);
      pushSimpleEffect(
        subscribe ? 9 : 8,
        { destroy: void 0 },
        updateStoreInstance.bind(null, fiber, hook, getServerSnapshot, getSnapshot),
        null
      );
      if (subscribe) {
        fiber.flags |= 2048;
        if (null === workInProgressRoot) throw Error(formatProdErrorMessage(349));
        isHydrating$jscomp$0 || 0 !== (renderLanes & 127) || pushStoreConsistencyCheck(fiber, getSnapshot, getServerSnapshot);
      }
      return getServerSnapshot;
    }
    function pushStoreConsistencyCheck(fiber, getSnapshot, renderedSnapshot) {
      fiber.flags |= 16384;
      fiber = { getSnapshot, value: renderedSnapshot };
      getSnapshot = currentlyRenderingFiber.updateQueue;
      null === getSnapshot ? (getSnapshot = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = getSnapshot, getSnapshot.stores = [fiber]) : (renderedSnapshot = getSnapshot.stores, null === renderedSnapshot ? getSnapshot.stores = [fiber] : renderedSnapshot.push(fiber));
    }
    function updateStoreInstance(fiber, inst, nextSnapshot, getSnapshot) {
      inst.value = nextSnapshot;
      inst.getSnapshot = getSnapshot;
      checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
    }
    function subscribeToStore(fiber, inst, subscribe) {
      return subscribe(function() {
        checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
      });
    }
    function checkIfSnapshotChanged(inst) {
      var latestGetSnapshot = inst.getSnapshot;
      inst = inst.value;
      try {
        var nextValue = latestGetSnapshot();
        return !objectIs(inst, nextValue);
      } catch (error) {
        return true;
      }
    }
    function forceStoreRerender(fiber) {
      var root2 = enqueueConcurrentRenderForLane(fiber, 2);
      null !== root2 && scheduleUpdateOnFiber(root2, fiber, 2);
    }
    function mountStateImpl(initialState) {
      var hook = mountWorkInProgressHook();
      if ("function" === typeof initialState) {
        var initialStateInitializer = initialState;
        initialState = initialStateInitializer();
        if (shouldDoubleInvokeUserFnsInHooksDEV) {
          setIsStrictModeForDevtools(true);
          try {
            initialStateInitializer();
          } finally {
            setIsStrictModeForDevtools(false);
          }
        }
      }
      hook.memoizedState = hook.baseState = initialState;
      hook.queue = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: basicStateReducer,
        lastRenderedState: initialState
      };
      return hook;
    }
    function updateOptimisticImpl(hook, current2, passthrough, reducer) {
      hook.baseState = passthrough;
      return updateReducerImpl(
        hook,
        currentHook,
        "function" === typeof reducer ? reducer : basicStateReducer
      );
    }
    function dispatchActionState(fiber, actionQueue, setPendingState, setState, payload) {
      if (isRenderPhaseUpdate(fiber)) throw Error(formatProdErrorMessage(485));
      fiber = actionQueue.action;
      if (null !== fiber) {
        var actionNode = {
          payload,
          action: fiber,
          next: null,
          isTransition: true,
          status: "pending",
          value: null,
          reason: null,
          listeners: [],
          then: function(listener) {
            actionNode.listeners.push(listener);
          }
        };
        null !== ReactSharedInternals.T ? setPendingState(true) : actionNode.isTransition = false;
        setState(actionNode);
        setPendingState = actionQueue.pending;
        null === setPendingState ? (actionNode.next = actionQueue.pending = actionNode, runActionStateAction(actionQueue, actionNode)) : (actionNode.next = setPendingState.next, actionQueue.pending = setPendingState.next = actionNode);
      }
    }
    function runActionStateAction(actionQueue, node) {
      var action = node.action, payload = node.payload, prevState = actionQueue.state;
      if (node.isTransition) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        currentTransition.types = null !== prevTransition ? prevTransition.types : null;
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = action(prevState, payload), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          handleActionReturnValue(actionQueue, node, returnValue);
        } catch (error) {
          onActionError(actionQueue, node, error);
        } finally {
          null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      } else
        try {
          prevTransition = action(prevState, payload), handleActionReturnValue(actionQueue, node, prevTransition);
        } catch (error$70) {
          onActionError(actionQueue, node, error$70);
        }
    }
    function handleActionReturnValue(actionQueue, node, returnValue) {
      null !== returnValue && "object" === typeof returnValue && "function" === typeof returnValue.then ? returnValue.then(
        function(nextState) {
          onActionSuccess(actionQueue, node, nextState);
        },
        function(error) {
          return onActionError(actionQueue, node, error);
        }
      ) : onActionSuccess(actionQueue, node, returnValue);
    }
    function onActionSuccess(actionQueue, actionNode, nextState) {
      actionNode.status = "fulfilled";
      actionNode.value = nextState;
      notifyActionListeners(actionNode);
      actionQueue.state = nextState;
      actionNode = actionQueue.pending;
      null !== actionNode && (nextState = actionNode.next, nextState === actionNode ? actionQueue.pending = null : (nextState = nextState.next, actionNode.next = nextState, runActionStateAction(actionQueue, nextState)));
    }
    function onActionError(actionQueue, actionNode, error) {
      var last = actionQueue.pending;
      actionQueue.pending = null;
      if (null !== last) {
        last = last.next;
        do
          actionNode.status = "rejected", actionNode.reason = error, notifyActionListeners(actionNode), actionNode = actionNode.next;
        while (actionNode !== last);
      }
      actionQueue.action = null;
    }
    function notifyActionListeners(actionNode) {
      actionNode = actionNode.listeners;
      for (var i = 0; i < actionNode.length; i++) (0, actionNode[i])();
    }
    function actionStateReducer(oldState, newState) {
      return newState;
    }
    function mountActionState(action, initialStateProp) {
      if (isHydrating) {
        var ssrFormState = workInProgressRoot.formState;
        if (null !== ssrFormState) {
          a: {
            var JSCompiler_inline_result = currentlyRenderingFiber;
            if (isHydrating) {
              if (nextHydratableInstance) {
                b: {
                  var JSCompiler_inline_result$jscomp$0 = nextHydratableInstance;
                  for (var inRootOrSingleton = rootOrSingletonContext; 8 !== JSCompiler_inline_result$jscomp$0.nodeType; ) {
                    if (!inRootOrSingleton) {
                      JSCompiler_inline_result$jscomp$0 = null;
                      break b;
                    }
                    JSCompiler_inline_result$jscomp$0 = getNextHydratable(
                      JSCompiler_inline_result$jscomp$0.nextSibling
                    );
                    if (null === JSCompiler_inline_result$jscomp$0) {
                      JSCompiler_inline_result$jscomp$0 = null;
                      break b;
                    }
                  }
                  inRootOrSingleton = JSCompiler_inline_result$jscomp$0.data;
                  JSCompiler_inline_result$jscomp$0 = "F!" === inRootOrSingleton || "F" === inRootOrSingleton ? JSCompiler_inline_result$jscomp$0 : null;
                }
                if (JSCompiler_inline_result$jscomp$0) {
                  nextHydratableInstance = getNextHydratable(
                    JSCompiler_inline_result$jscomp$0.nextSibling
                  );
                  JSCompiler_inline_result = "F!" === JSCompiler_inline_result$jscomp$0.data;
                  break a;
                }
              }
              throwOnHydrationMismatch(JSCompiler_inline_result);
            }
            JSCompiler_inline_result = false;
          }
          JSCompiler_inline_result && (initialStateProp = ssrFormState[0]);
        }
      }
      ssrFormState = mountWorkInProgressHook();
      ssrFormState.memoizedState = ssrFormState.baseState = initialStateProp;
      JSCompiler_inline_result = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: actionStateReducer,
        lastRenderedState: initialStateProp
      };
      ssrFormState.queue = JSCompiler_inline_result;
      ssrFormState = dispatchSetState.bind(
        null,
        currentlyRenderingFiber,
        JSCompiler_inline_result
      );
      JSCompiler_inline_result.dispatch = ssrFormState;
      JSCompiler_inline_result = mountStateImpl(false);
      inRootOrSingleton = dispatchOptimisticSetState.bind(
        null,
        currentlyRenderingFiber,
        false,
        JSCompiler_inline_result.queue
      );
      JSCompiler_inline_result = mountWorkInProgressHook();
      JSCompiler_inline_result$jscomp$0 = {
        state: initialStateProp,
        dispatch: null,
        action,
        pending: null
      };
      JSCompiler_inline_result.queue = JSCompiler_inline_result$jscomp$0;
      ssrFormState = dispatchActionState.bind(
        null,
        currentlyRenderingFiber,
        JSCompiler_inline_result$jscomp$0,
        inRootOrSingleton,
        ssrFormState
      );
      JSCompiler_inline_result$jscomp$0.dispatch = ssrFormState;
      JSCompiler_inline_result.memoizedState = action;
      return [initialStateProp, ssrFormState, false];
    }
    function updateActionState(action) {
      var stateHook = updateWorkInProgressHook();
      return updateActionStateImpl(stateHook, currentHook, action);
    }
    function updateActionStateImpl(stateHook, currentStateHook, action) {
      currentStateHook = updateReducerImpl(
        stateHook,
        currentStateHook,
        actionStateReducer
      )[0];
      stateHook = updateReducer(basicStateReducer)[0];
      if ("object" === typeof currentStateHook && null !== currentStateHook && "function" === typeof currentStateHook.then)
        try {
          var state = useThenable(currentStateHook);
        } catch (x) {
          if (x === SuspenseException) throw SuspenseActionException;
          throw x;
        }
      else state = currentStateHook;
      currentStateHook = updateWorkInProgressHook();
      var actionQueue = currentStateHook.queue, dispatch = actionQueue.dispatch;
      action !== currentStateHook.memoizedState && (currentlyRenderingFiber.flags |= 2048, pushSimpleEffect(
        9,
        { destroy: void 0 },
        actionStateActionEffect.bind(null, actionQueue, action),
        null
      ));
      return [state, dispatch, stateHook];
    }
    function actionStateActionEffect(actionQueue, action) {
      actionQueue.action = action;
    }
    function rerenderActionState(action) {
      var stateHook = updateWorkInProgressHook(), currentStateHook = currentHook;
      if (null !== currentStateHook)
        return updateActionStateImpl(stateHook, currentStateHook, action);
      updateWorkInProgressHook();
      stateHook = stateHook.memoizedState;
      currentStateHook = updateWorkInProgressHook();
      var dispatch = currentStateHook.queue.dispatch;
      currentStateHook.memoizedState = action;
      return [stateHook, dispatch, false];
    }
    function pushSimpleEffect(tag, inst, create, deps) {
      tag = { tag, create, deps, inst, next: null };
      inst = currentlyRenderingFiber.updateQueue;
      null === inst && (inst = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = inst);
      create = inst.lastEffect;
      null === create ? inst.lastEffect = tag.next = tag : (deps = create.next, create.next = tag, tag.next = deps, inst.lastEffect = tag);
      return tag;
    }
    function updateRef() {
      return updateWorkInProgressHook().memoizedState;
    }
    function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
      var hook = mountWorkInProgressHook();
      currentlyRenderingFiber.flags |= fiberFlags;
      hook.memoizedState = pushSimpleEffect(
        1 | hookFlags,
        { destroy: void 0 },
        create,
        void 0 === deps ? null : deps
      );
    }
    function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
      var hook = updateWorkInProgressHook();
      deps = void 0 === deps ? null : deps;
      var inst = hook.memoizedState.inst;
      null !== currentHook && null !== deps && areHookInputsEqual(deps, currentHook.memoizedState.deps) ? hook.memoizedState = pushSimpleEffect(hookFlags, inst, create, deps) : (currentlyRenderingFiber.flags |= fiberFlags, hook.memoizedState = pushSimpleEffect(
        1 | hookFlags,
        inst,
        create,
        deps
      ));
    }
    function mountEffect(create, deps) {
      mountEffectImpl(8390656, 8, create, deps);
    }
    function updateEffect(create, deps) {
      updateEffectImpl(2048, 8, create, deps);
    }
    function useEffectEventImpl(payload) {
      currentlyRenderingFiber.flags |= 4;
      var componentUpdateQueue = currentlyRenderingFiber.updateQueue;
      if (null === componentUpdateQueue)
        componentUpdateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = componentUpdateQueue, componentUpdateQueue.events = [payload];
      else {
        var events = componentUpdateQueue.events;
        null === events ? componentUpdateQueue.events = [payload] : events.push(payload);
      }
    }
    function updateEvent(callback) {
      var ref = updateWorkInProgressHook().memoizedState;
      useEffectEventImpl({ ref, nextImpl: callback });
      return function() {
        if (0 !== (executionContext & 2)) throw Error(formatProdErrorMessage(440));
        return ref.impl.apply(void 0, arguments);
      };
    }
    function updateInsertionEffect(create, deps) {
      return updateEffectImpl(4, 2, create, deps);
    }
    function updateLayoutEffect(create, deps) {
      return updateEffectImpl(4, 4, create, deps);
    }
    function imperativeHandleEffect(create, ref) {
      if ("function" === typeof ref) {
        create = create();
        var refCleanup = ref(create);
        return function() {
          "function" === typeof refCleanup ? refCleanup() : ref(null);
        };
      }
      if (null !== ref && void 0 !== ref)
        return create = create(), ref.current = create, function() {
          ref.current = null;
        };
    }
    function updateImperativeHandle(ref, create, deps) {
      deps = null !== deps && void 0 !== deps ? deps.concat([ref]) : null;
      updateEffectImpl(4, 4, imperativeHandleEffect.bind(null, create, ref), deps);
    }
    function mountDebugValue() {
    }
    function updateCallback(callback, deps) {
      var hook = updateWorkInProgressHook();
      deps = void 0 === deps ? null : deps;
      var prevState = hook.memoizedState;
      if (null !== deps && areHookInputsEqual(deps, prevState[1]))
        return prevState[0];
      hook.memoizedState = [callback, deps];
      return callback;
    }
    function updateMemo(nextCreate, deps) {
      var hook = updateWorkInProgressHook();
      deps = void 0 === deps ? null : deps;
      var prevState = hook.memoizedState;
      if (null !== deps && areHookInputsEqual(deps, prevState[1]))
        return prevState[0];
      prevState = nextCreate();
      if (shouldDoubleInvokeUserFnsInHooksDEV) {
        setIsStrictModeForDevtools(true);
        try {
          nextCreate();
        } finally {
          setIsStrictModeForDevtools(false);
        }
      }
      hook.memoizedState = [prevState, deps];
      return prevState;
    }
    function mountDeferredValueImpl(hook, value, initialValue) {
      if (void 0 === initialValue || 0 !== (renderLanes & 1073741824) && 0 === (workInProgressRootRenderLanes & 261930))
        return hook.memoizedState = value;
      hook.memoizedState = initialValue;
      hook = requestDeferredLane();
      currentlyRenderingFiber.lanes |= hook;
      workInProgressRootSkippedLanes |= hook;
      return initialValue;
    }
    function updateDeferredValueImpl(hook, prevValue, value, initialValue) {
      if (objectIs(value, prevValue)) return value;
      if (null !== currentTreeHiddenStackCursor.current)
        return hook = mountDeferredValueImpl(hook, value, initialValue), objectIs(hook, prevValue) || (didReceiveUpdate = true), hook;
      if (0 === (renderLanes & 106) || 0 !== (renderLanes & 1073741824) && 0 === (workInProgressRootRenderLanes & 261930))
        return didReceiveUpdate = true, hook.memoizedState = value;
      hook = requestDeferredLane();
      currentlyRenderingFiber.lanes |= hook;
      workInProgressRootSkippedLanes |= hook;
      return prevValue;
    }
    function startTransition(fiber, queue, pendingState, finishedState, callback) {
      var previousPriority = ReactDOMSharedInternals.p;
      ReactDOMSharedInternals.p = 0 !== previousPriority && 8 > previousPriority ? previousPriority : 8;
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      currentTransition.types = null !== prevTransition ? prevTransition.types : null;
      ReactSharedInternals.T = currentTransition;
      dispatchOptimisticSetState(fiber, false, queue, pendingState);
      try {
        var returnValue = callback(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        if (null !== returnValue && "object" === typeof returnValue && "function" === typeof returnValue.then) {
          var thenableForFinishedState = chainThenableValue(
            returnValue,
            finishedState
          );
          dispatchSetStateInternal(
            fiber,
            queue,
            thenableForFinishedState,
            requestUpdateLane(fiber)
          );
        } else
          dispatchSetStateInternal(
            fiber,
            queue,
            finishedState,
            requestUpdateLane(fiber)
          );
      } catch (error) {
        dispatchSetStateInternal(
          fiber,
          queue,
          { then: function() {
          }, status: "rejected", reason: error },
          requestUpdateLane()
        );
      } finally {
        ReactDOMSharedInternals.p = previousPriority, null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
      }
    }
    function noop2() {
    }
    function startHostTransition(formFiber, pendingState, action, formData) {
      if (5 !== formFiber.tag) throw Error(formatProdErrorMessage(476));
      var queue = ensureFormComponentIsStateful(formFiber).queue;
      startTransition(
        formFiber,
        queue,
        pendingState,
        sharedNotPendingObject,
        null === action ? noop2 : function() {
          requestFormReset$1(formFiber);
          return action(formData);
        }
      );
    }
    function ensureFormComponentIsStateful(formFiber) {
      var existingStateHook = formFiber.memoizedState;
      if (null !== existingStateHook) return existingStateHook;
      existingStateHook = {
        memoizedState: sharedNotPendingObject,
        baseState: sharedNotPendingObject,
        baseQueue: null,
        queue: {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: basicStateReducer,
          lastRenderedState: sharedNotPendingObject
        },
        next: null
      };
      var initialResetState = {};
      existingStateHook.next = {
        memoizedState: initialResetState,
        baseState: initialResetState,
        baseQueue: null,
        queue: {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: basicStateReducer,
          lastRenderedState: initialResetState
        },
        next: null
      };
      formFiber.memoizedState = existingStateHook;
      formFiber = formFiber.alternate;
      null !== formFiber && (formFiber.memoizedState = existingStateHook);
      return existingStateHook;
    }
    function requestFormReset$1(formFiber) {
      var stateHook = ensureFormComponentIsStateful(formFiber);
      null === stateHook.next && (stateHook = formFiber.alternate.memoizedState);
      dispatchSetStateInternal(
        formFiber,
        stateHook.next.queue,
        {},
        requestUpdateLane()
      );
    }
    function useHostTransitionStatus() {
      return readContext(HostTransitionContext);
    }
    function updateId() {
      return updateWorkInProgressHook().memoizedState;
    }
    function updateRefresh() {
      return updateWorkInProgressHook().memoizedState;
    }
    function refreshCache(fiber) {
      for (var provider = fiber.return; null !== provider; ) {
        switch (provider.tag) {
          case 24:
          case 3:
            var lane = requestUpdateLane();
            fiber = createUpdate(lane);
            var root$73 = enqueueUpdate(provider, fiber, lane);
            null !== root$73 && (scheduleUpdateOnFiber(root$73, provider, lane), entangleTransitions(root$73, provider, lane));
            provider = { cache: createCache() };
            fiber.payload = provider;
            return;
        }
        provider = provider.return;
      }
    }
    function dispatchReducerAction(fiber, queue, action) {
      var lane = requestUpdateLane();
      action = {
        lane,
        revertLane: 0,
        gesture: null,
        action,
        hasEagerState: false,
        eagerState: null,
        next: null
      };
      isRenderPhaseUpdate(fiber) ? enqueueRenderPhaseUpdate(queue, action) : (action = enqueueConcurrentHookUpdate(fiber, queue, action, lane), null !== action && (scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane)));
    }
    function dispatchSetState(fiber, queue, action) {
      var lane = requestUpdateLane();
      dispatchSetStateInternal(fiber, queue, action, lane);
    }
    function dispatchSetStateInternal(fiber, queue, action, lane) {
      var update = {
        lane,
        revertLane: 0,
        gesture: null,
        action,
        hasEagerState: false,
        eagerState: null,
        next: null
      };
      if (isRenderPhaseUpdate(fiber)) enqueueRenderPhaseUpdate(queue, update);
      else {
        var alternate = fiber.alternate;
        if (0 === fiber.lanes && (null === alternate || 0 === alternate.lanes) && (alternate = queue.lastRenderedReducer, null !== alternate))
          try {
            var currentState = queue.lastRenderedState, eagerState = alternate(currentState, action);
            update.hasEagerState = true;
            update.eagerState = eagerState;
            if (objectIs(eagerState, currentState))
              return enqueueUpdate$1(fiber, queue, update, 0), null === workInProgressRoot && finishQueueingConcurrentUpdates(), false;
          } catch (error) {
          } finally {
          }
        action = enqueueConcurrentHookUpdate(fiber, queue, update, lane);
        if (null !== action)
          return scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane), true;
      }
      return false;
    }
    function dispatchOptimisticSetState(fiber, throwIfDuringRender, queue, action) {
      action = {
        lane: 2,
        revertLane: requestTransitionLane(),
        gesture: null,
        action,
        hasEagerState: false,
        eagerState: null,
        next: null
      };
      if (isRenderPhaseUpdate(fiber)) {
        if (throwIfDuringRender) throw Error(formatProdErrorMessage(479));
      } else
        throwIfDuringRender = enqueueConcurrentHookUpdate(
          fiber,
          queue,
          action,
          2
        ), null !== throwIfDuringRender && scheduleUpdateOnFiber(throwIfDuringRender, fiber, 2);
    }
    function isRenderPhaseUpdate(fiber) {
      var alternate = fiber.alternate;
      return fiber === currentlyRenderingFiber || null !== alternate && alternate === currentlyRenderingFiber;
    }
    function enqueueRenderPhaseUpdate(queue, update) {
      didScheduleRenderPhaseUpdateDuringThisPass = didScheduleRenderPhaseUpdate = true;
      var pending = queue.pending;
      null === pending ? update.next = update : (update.next = pending.next, pending.next = update);
      queue.pending = update;
    }
    function entangleTransitionUpdate(root2, queue, lane) {
      if (0 !== (lane & 4194048)) {
        var queueLanes = queue.lanes;
        queueLanes &= root2.pendingLanes;
        lane |= queueLanes;
        queue.lanes = lane;
        markRootEntangled(root2, lane);
      }
    }
    var ContextOnlyDispatcher = {
      readContext,
      use,
      useCallback: throwInvalidHookError,
      useContext: throwInvalidHookError,
      useEffect: throwInvalidHookError,
      useImperativeHandle: throwInvalidHookError,
      useLayoutEffect: throwInvalidHookError,
      useInsertionEffect: throwInvalidHookError,
      useMemo: throwInvalidHookError,
      useReducer: throwInvalidHookError,
      useRef: throwInvalidHookError,
      useState: throwInvalidHookError,
      useDebugValue: throwInvalidHookError,
      useDeferredValue: throwInvalidHookError,
      useTransition: throwInvalidHookError,
      useSyncExternalStore: throwInvalidHookError,
      useId: throwInvalidHookError,
      useHostTransitionStatus: throwInvalidHookError,
      useFormState: throwInvalidHookError,
      useActionState: throwInvalidHookError,
      useOptimistic: throwInvalidHookError,
      useMemoCache: throwInvalidHookError,
      useCacheRefresh: throwInvalidHookError,
      useEffectEvent: throwInvalidHookError
    };
    var HooksDispatcherOnMount = {
      readContext,
      use,
      useCallback: function(callback, deps) {
        mountWorkInProgressHook().memoizedState = [
          callback,
          void 0 === deps ? null : deps
        ];
        return callback;
      },
      useContext: readContext,
      useEffect: mountEffect,
      useImperativeHandle: function(ref, create, deps) {
        deps = null !== deps && void 0 !== deps ? deps.concat([ref]) : null;
        mountEffectImpl(
          4194308,
          4,
          imperativeHandleEffect.bind(null, create, ref),
          deps
        );
      },
      useLayoutEffect: function(create, deps) {
        return mountEffectImpl(4194308, 4, create, deps);
      },
      useInsertionEffect: function(create, deps) {
        mountEffectImpl(4, 2, create, deps);
      },
      useMemo: function(nextCreate, deps) {
        var hook = mountWorkInProgressHook();
        deps = void 0 === deps ? null : deps;
        var nextValue = nextCreate();
        if (shouldDoubleInvokeUserFnsInHooksDEV) {
          setIsStrictModeForDevtools(true);
          try {
            nextCreate();
          } finally {
            setIsStrictModeForDevtools(false);
          }
        }
        hook.memoizedState = [nextValue, deps];
        return nextValue;
      },
      useReducer: function(reducer, initialArg, init) {
        var hook = mountWorkInProgressHook();
        if (void 0 !== init) {
          var initialState = init(initialArg);
          if (shouldDoubleInvokeUserFnsInHooksDEV) {
            setIsStrictModeForDevtools(true);
            try {
              init(initialArg);
            } finally {
              setIsStrictModeForDevtools(false);
            }
          }
        } else initialState = initialArg;
        hook.memoizedState = hook.baseState = initialState;
        reducer = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: reducer,
          lastRenderedState: initialState
        };
        hook.queue = reducer;
        reducer = reducer.dispatch = dispatchReducerAction.bind(
          null,
          currentlyRenderingFiber,
          reducer
        );
        return [hook.memoizedState, reducer];
      },
      useRef: function(initialValue) {
        var hook = mountWorkInProgressHook();
        initialValue = { current: initialValue };
        return hook.memoizedState = initialValue;
      },
      useState: function(initialState) {
        initialState = mountStateImpl(initialState);
        var queue = initialState.queue, dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
        queue.dispatch = dispatch;
        return [initialState.memoizedState, dispatch];
      },
      useDebugValue: mountDebugValue,
      useDeferredValue: function(value, initialValue) {
        var hook = mountWorkInProgressHook();
        return mountDeferredValueImpl(hook, value, initialValue);
      },
      useTransition: function() {
        var stateHook = mountStateImpl(false);
        stateHook = startTransition.bind(
          null,
          currentlyRenderingFiber,
          stateHook.queue,
          true,
          false
        );
        mountWorkInProgressHook().memoizedState = stateHook;
        return [false, stateHook];
      },
      useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
        var fiber = currentlyRenderingFiber, hook = mountWorkInProgressHook();
        if (isHydrating) {
          if (void 0 === getServerSnapshot)
            throw Error(formatProdErrorMessage(407));
          getServerSnapshot = getServerSnapshot();
        } else {
          getServerSnapshot = getSnapshot();
          if (null === workInProgressRoot)
            throw Error(formatProdErrorMessage(349));
          0 !== (workInProgressRootRenderLanes & 127) || pushStoreConsistencyCheck(fiber, getSnapshot, getServerSnapshot);
        }
        hook.memoizedState = getServerSnapshot;
        var inst = { value: getServerSnapshot, getSnapshot };
        hook.queue = inst;
        mountEffect(subscribeToStore.bind(null, fiber, inst, subscribe), [
          subscribe
        ]);
        fiber.flags |= 2048;
        pushSimpleEffect(
          9,
          { destroy: void 0 },
          updateStoreInstance.bind(
            null,
            fiber,
            inst,
            getServerSnapshot,
            getSnapshot
          ),
          null
        );
        return getServerSnapshot;
      },
      useId: function() {
        var hook = mountWorkInProgressHook(), identifierPrefix = workInProgressRoot.identifierPrefix;
        if (isHydrating) {
          var JSCompiler_inline_result = treeContextOverflow;
          var idWithLeadingBit = treeContextId;
          JSCompiler_inline_result = (idWithLeadingBit & ~(1 << 32 - clz32(idWithLeadingBit) - 1)).toString(32) + JSCompiler_inline_result;
          identifierPrefix = "_" + identifierPrefix + "R_" + JSCompiler_inline_result;
          JSCompiler_inline_result = localIdCounter++;
          0 < JSCompiler_inline_result && (identifierPrefix += "H" + JSCompiler_inline_result.toString(32));
          identifierPrefix += "_";
        } else
          JSCompiler_inline_result = globalClientIdCounter++, identifierPrefix = "_" + identifierPrefix + "r_" + JSCompiler_inline_result.toString(32) + "_";
        return hook.memoizedState = identifierPrefix;
      },
      useHostTransitionStatus,
      useFormState: mountActionState,
      useActionState: mountActionState,
      useOptimistic: function(passthrough) {
        var hook = mountWorkInProgressHook();
        hook.memoizedState = hook.baseState = passthrough;
        var queue = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: null,
          lastRenderedState: null
        };
        hook.queue = queue;
        hook = dispatchOptimisticSetState.bind(
          null,
          currentlyRenderingFiber,
          true,
          queue
        );
        queue.dispatch = hook;
        return [passthrough, hook];
      },
      useMemoCache,
      useCacheRefresh: function() {
        return mountWorkInProgressHook().memoizedState = refreshCache.bind(
          null,
          currentlyRenderingFiber
        );
      },
      useEffectEvent: function(callback) {
        var hook = mountWorkInProgressHook(), ref = { impl: callback };
        hook.memoizedState = ref;
        return function() {
          if (0 !== (executionContext & 2))
            throw Error(formatProdErrorMessage(440));
          return ref.impl.apply(void 0, arguments);
        };
      }
    };
    var HooksDispatcherOnUpdate = {
      readContext,
      use,
      useCallback: updateCallback,
      useContext: readContext,
      useEffect: updateEffect,
      useImperativeHandle: updateImperativeHandle,
      useInsertionEffect: updateInsertionEffect,
      useLayoutEffect: updateLayoutEffect,
      useMemo: updateMemo,
      useReducer: updateReducer,
      useRef: updateRef,
      useState: function() {
        return updateReducer(basicStateReducer);
      },
      useDebugValue: mountDebugValue,
      useDeferredValue: function(value, initialValue) {
        var hook = updateWorkInProgressHook();
        return updateDeferredValueImpl(
          hook,
          currentHook.memoizedState,
          value,
          initialValue
        );
      },
      useTransition: function() {
        var booleanOrThenable = updateReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
        return [
          "boolean" === typeof booleanOrThenable ? booleanOrThenable : useThenable(booleanOrThenable),
          start
        ];
      },
      useSyncExternalStore: updateSyncExternalStore,
      useId: updateId,
      useHostTransitionStatus,
      useFormState: updateActionState,
      useActionState: updateActionState,
      useOptimistic: function(passthrough, reducer) {
        var hook = updateWorkInProgressHook();
        return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
      },
      useMemoCache,
      useCacheRefresh: updateRefresh,
      useEffectEvent: updateEvent
    };
    var HooksDispatcherOnRerender = {
      readContext,
      use,
      useCallback: updateCallback,
      useContext: readContext,
      useEffect: updateEffect,
      useImperativeHandle: updateImperativeHandle,
      useInsertionEffect: updateInsertionEffect,
      useLayoutEffect: updateLayoutEffect,
      useMemo: updateMemo,
      useReducer: rerenderReducer,
      useRef: updateRef,
      useState: function() {
        return rerenderReducer(basicStateReducer);
      },
      useDebugValue: mountDebugValue,
      useDeferredValue: function(value, initialValue) {
        var hook = updateWorkInProgressHook();
        return null === currentHook ? mountDeferredValueImpl(hook, value, initialValue) : updateDeferredValueImpl(
          hook,
          currentHook.memoizedState,
          value,
          initialValue
        );
      },
      useTransition: function() {
        var booleanOrThenable = rerenderReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
        return [
          "boolean" === typeof booleanOrThenable ? booleanOrThenable : useThenable(booleanOrThenable),
          start
        ];
      },
      useSyncExternalStore: updateSyncExternalStore,
      useId: updateId,
      useHostTransitionStatus,
      useFormState: rerenderActionState,
      useActionState: rerenderActionState,
      useOptimistic: function(passthrough, reducer) {
        var hook = updateWorkInProgressHook();
        if (null !== currentHook)
          return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
        hook.baseState = passthrough;
        return [passthrough, hook.queue.dispatch];
      },
      useMemoCache,
      useCacheRefresh: updateRefresh,
      useEffectEvent: updateEvent
    };
    function applyDerivedStateFromProps(workInProgress2, ctor, getDerivedStateFromProps, nextProps) {
      ctor = workInProgress2.memoizedState;
      getDerivedStateFromProps = getDerivedStateFromProps(nextProps, ctor);
      getDerivedStateFromProps = null === getDerivedStateFromProps || void 0 === getDerivedStateFromProps ? ctor : assign({}, ctor, getDerivedStateFromProps);
      workInProgress2.memoizedState = getDerivedStateFromProps;
      0 === workInProgress2.lanes && (workInProgress2.updateQueue.baseState = getDerivedStateFromProps);
    }
    var classComponentUpdater = {
      enqueueSetState: function(inst, payload, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(), update = createUpdate(lane);
        update.payload = payload;
        void 0 !== callback && null !== callback && (update.callback = callback);
        payload = enqueueUpdate(inst, update, lane);
        null !== payload && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
      },
      enqueueReplaceState: function(inst, payload, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(), update = createUpdate(lane);
        update.tag = 1;
        update.payload = payload;
        void 0 !== callback && null !== callback && (update.callback = callback);
        payload = enqueueUpdate(inst, update, lane);
        null !== payload && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
      },
      enqueueForceUpdate: function(inst, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(), update = createUpdate(lane);
        update.tag = 2;
        void 0 !== callback && null !== callback && (update.callback = callback);
        callback = enqueueUpdate(inst, update, lane);
        null !== callback && (scheduleUpdateOnFiber(callback, inst, lane), entangleTransitions(callback, inst, lane));
      }
    };
    function checkShouldComponentUpdate(workInProgress2, ctor, oldProps, newProps, oldState, newState, nextContext) {
      workInProgress2 = workInProgress2.stateNode;
      return "function" === typeof workInProgress2.shouldComponentUpdate ? workInProgress2.shouldComponentUpdate(newProps, newState, nextContext) : ctor.prototype && ctor.prototype.isPureReactComponent ? !shallowEqual(oldProps, newProps) || !shallowEqual(oldState, newState) : true;
    }
    function callComponentWillReceiveProps(workInProgress2, instance, newProps, nextContext) {
      workInProgress2 = instance.state;
      "function" === typeof instance.componentWillReceiveProps && instance.componentWillReceiveProps(newProps, nextContext);
      "function" === typeof instance.UNSAFE_componentWillReceiveProps && instance.UNSAFE_componentWillReceiveProps(newProps, nextContext);
      instance.state !== workInProgress2 && classComponentUpdater.enqueueReplaceState(instance, instance.state, null);
    }
    function resolveClassComponentProps(Component, baseProps) {
      var newProps = baseProps;
      if ("ref" in baseProps) {
        newProps = {};
        for (var propName in baseProps)
          "ref" !== propName && (newProps[propName] = baseProps[propName]);
      }
      if (Component = Component.defaultProps) {
        newProps === baseProps && (newProps = assign({}, newProps));
        for (var propName$77 in Component)
          void 0 === newProps[propName$77] && (newProps[propName$77] = Component[propName$77]);
      }
      return newProps;
    }
    function defaultOnUncaughtError(error) {
      reportGlobalError(error);
    }
    function defaultOnCaughtError(error) {
      console.error(error);
    }
    function defaultOnRecoverableError(error) {
      reportGlobalError(error);
    }
    function logUncaughtError(root2, errorInfo) {
      try {
        var onUncaughtError = root2.onUncaughtError;
        onUncaughtError(errorInfo.value, { componentStack: errorInfo.stack });
      } catch (e$78) {
        setTimeout(function() {
          throw e$78;
        });
      }
    }
    function logCaughtError(root2, boundary, errorInfo) {
      try {
        var onCaughtError = root2.onCaughtError;
        onCaughtError(errorInfo.value, {
          componentStack: errorInfo.stack,
          errorBoundary: 1 === boundary.tag ? boundary.stateNode : null
        });
      } catch (e$79) {
        setTimeout(function() {
          throw e$79;
        });
      }
    }
    function createRootErrorUpdate(root2, errorInfo, lane) {
      lane = createUpdate(lane);
      lane.tag = 3;
      lane.payload = { element: null };
      lane.callback = function() {
        logUncaughtError(root2, errorInfo);
      };
      return lane;
    }
    function createClassErrorUpdate(lane) {
      lane = createUpdate(lane);
      lane.tag = 3;
      return lane;
    }
    function initializeClassErrorUpdate(update, root2, fiber, errorInfo) {
      var getDerivedStateFromError = fiber.type.getDerivedStateFromError;
      if ("function" === typeof getDerivedStateFromError) {
        var error = errorInfo.value;
        update.payload = function() {
          return getDerivedStateFromError(error);
        };
        update.callback = function() {
          logCaughtError(root2, fiber, errorInfo);
        };
      }
      var inst = fiber.stateNode;
      null !== inst && "function" === typeof inst.componentDidCatch && (update.callback = function() {
        logCaughtError(root2, fiber, errorInfo);
        "function" !== typeof getDerivedStateFromError && (null === legacyErrorBoundariesThatAlreadyFailed ? legacyErrorBoundariesThatAlreadyFailed = /* @__PURE__ */ new Set([this]) : legacyErrorBoundariesThatAlreadyFailed.add(this));
        var stack = errorInfo.stack;
        this.componentDidCatch(errorInfo.value, {
          componentStack: null !== stack ? stack : ""
        });
      });
    }
    function throwException(root2, returnFiber, sourceFiber, value, rootRenderLanes) {
      sourceFiber.flags |= 32768;
      if (null !== value && "object" === typeof value && "function" === typeof value.then) {
        returnFiber = sourceFiber.alternate;
        null !== returnFiber && propagateParentContextChanges(
          returnFiber,
          sourceFiber,
          rootRenderLanes,
          true
        );
        sourceFiber = suspenseHandlerStackCursor.current;
        if (null !== sourceFiber) {
          switch (sourceFiber.tag) {
            case 31:
            case 13:
            case 19:
              return null === shellBoundary ? renderDidSuspendDelayIfPossible() : null === sourceFiber.alternate && 0 === workInProgressRootExitStatus && (workInProgressRootExitStatus = 3), sourceFiber.flags &= -257, sourceFiber.flags |= 65536, sourceFiber.lanes = rootRenderLanes, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, null === returnFiber ? sourceFiber.updateQueue = /* @__PURE__ */ new Set([value]) : returnFiber.add(value), attachPingListener(root2, value, rootRenderLanes)), false;
            case 22:
              return sourceFiber.flags |= 65536, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, null === returnFiber ? (returnFiber = {
                transitions: null,
                markerInstances: null,
                retryQueue: /* @__PURE__ */ new Set([value])
              }, sourceFiber.updateQueue = returnFiber) : (sourceFiber = returnFiber.retryQueue, null === sourceFiber ? returnFiber.retryQueue = /* @__PURE__ */ new Set([value]) : sourceFiber.add(value)), attachPingListener(root2, value, rootRenderLanes)), false;
          }
          throw Error(formatProdErrorMessage(435, sourceFiber.tag));
        }
        attachPingListener(root2, value, rootRenderLanes);
        renderDidSuspendDelayIfPossible();
        return false;
      }
      if (isHydrating)
        return returnFiber = suspenseHandlerStackCursor.current, null !== returnFiber ? (0 === (returnFiber.flags & 65536) && (returnFiber.flags |= 256), returnFiber.flags |= 65536, returnFiber.lanes = rootRenderLanes, value !== HydrationMismatchException && (root2 = Error(formatProdErrorMessage(422), { cause: value }), queueHydrationError(createCapturedValueAtFiber(root2, sourceFiber)))) : (value !== HydrationMismatchException && (returnFiber = Error(formatProdErrorMessage(423), {
          cause: value
        }), queueHydrationError(
          createCapturedValueAtFiber(returnFiber, sourceFiber)
        )), root2 = root2.current.alternate, root2.flags |= 65536, rootRenderLanes &= -rootRenderLanes, root2.lanes |= rootRenderLanes, value = createCapturedValueAtFiber(value, sourceFiber), rootRenderLanes = createRootErrorUpdate(
          root2.stateNode,
          value,
          rootRenderLanes
        ), enqueueCapturedUpdate(root2, rootRenderLanes), 4 !== workInProgressRootExitStatus && (workInProgressRootExitStatus = 2)), false;
      var wrapperError = Error(formatProdErrorMessage(520), { cause: value });
      wrapperError = createCapturedValueAtFiber(wrapperError, sourceFiber);
      null === workInProgressRootConcurrentErrors ? workInProgressRootConcurrentErrors = [wrapperError] : workInProgressRootConcurrentErrors.push(wrapperError);
      4 !== workInProgressRootExitStatus && (workInProgressRootExitStatus = 2);
      if (null === returnFiber) return true;
      value = createCapturedValueAtFiber(value, sourceFiber);
      sourceFiber = returnFiber;
      do {
        switch (sourceFiber.tag) {
          case 3:
            return sourceFiber.flags |= 65536, root2 = rootRenderLanes & -rootRenderLanes, sourceFiber.lanes |= root2, root2 = createRootErrorUpdate(sourceFiber.stateNode, value, root2), enqueueCapturedUpdate(sourceFiber, root2), false;
          case 1:
            returnFiber = sourceFiber.type;
            wrapperError = sourceFiber.stateNode;
            if (0 === (sourceFiber.flags & 128) && ("function" === typeof returnFiber.getDerivedStateFromError || null !== wrapperError && "function" === typeof wrapperError.componentDidCatch && (null === legacyErrorBoundariesThatAlreadyFailed || !legacyErrorBoundariesThatAlreadyFailed.has(wrapperError))))
              return sourceFiber.flags |= 65536, rootRenderLanes &= -rootRenderLanes, sourceFiber.lanes |= rootRenderLanes, rootRenderLanes = createClassErrorUpdate(rootRenderLanes), initializeClassErrorUpdate(
                rootRenderLanes,
                root2,
                sourceFiber,
                value
              ), enqueueCapturedUpdate(sourceFiber, rootRenderLanes), false;
            break;
          case 22:
            if (null !== sourceFiber.memoizedState)
              return sourceFiber.flags |= 65536, false;
        }
        sourceFiber = sourceFiber.return;
      } while (null !== sourceFiber);
      return false;
    }
    var SelectiveHydrationException = Error(formatProdErrorMessage(461));
    var didReceiveUpdate = false;
    function reconcileChildren(current2, workInProgress2, nextChildren, renderLanes2) {
      workInProgress2.child = null === current2 ? mountChildFibers(workInProgress2, null, nextChildren, renderLanes2) : reconcileChildFibers(
        workInProgress2,
        current2.child,
        nextChildren,
        renderLanes2
      );
    }
    function updateForwardRef(current2, workInProgress2, Component, nextProps, renderLanes2) {
      Component = Component.render;
      var ref = workInProgress2.ref;
      if ("ref" in nextProps) {
        var propsWithoutRef = {};
        for (var key2 in nextProps)
          "ref" !== key2 && (propsWithoutRef[key2] = nextProps[key2]);
      } else propsWithoutRef = nextProps;
      prepareToReadContext(workInProgress2);
      nextProps = renderWithHooks(
        current2,
        workInProgress2,
        Component,
        propsWithoutRef,
        ref,
        renderLanes2
      );
      key2 = checkDidRenderIdHook();
      if (null !== current2 && !didReceiveUpdate)
        return bailoutHooks(current2, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
      isHydrating && key2 && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current2, workInProgress2, nextProps, renderLanes2);
      return workInProgress2.child;
    }
    function updateMemoComponent(current2, workInProgress2, Component, nextProps, renderLanes2) {
      if (null === current2) {
        var type = Component.type;
        if ("function" === typeof type && !shouldConstruct(type) && void 0 === type.defaultProps && null === Component.compare)
          return workInProgress2.tag = 15, workInProgress2.type = type, updateSimpleMemoComponent(
            current2,
            workInProgress2,
            type,
            nextProps,
            renderLanes2
          );
        current2 = createFiberFromTypeAndProps(
          Component.type,
          null,
          nextProps,
          workInProgress2,
          workInProgress2.mode,
          renderLanes2
        );
        current2.ref = workInProgress2.ref;
        current2.return = workInProgress2;
        return workInProgress2.child = current2;
      }
      type = current2.child;
      if (!checkScheduledUpdateOrContext(current2, renderLanes2)) {
        var prevProps = type.memoizedProps;
        Component = Component.compare;
        Component = null !== Component ? Component : shallowEqual;
        if (Component(prevProps, nextProps) && current2.ref === workInProgress2.ref)
          return bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
      }
      workInProgress2.flags |= 1;
      current2 = createWorkInProgress(type, nextProps);
      current2.ref = workInProgress2.ref;
      current2.return = workInProgress2;
      return workInProgress2.child = current2;
    }
    function updateSimpleMemoComponent(current2, workInProgress2, Component, nextProps, renderLanes2) {
      if (null !== current2) {
        var prevProps = current2.memoizedProps;
        if (shallowEqual(prevProps, nextProps) && current2.ref === workInProgress2.ref)
          if (didReceiveUpdate = false, workInProgress2.pendingProps = nextProps = prevProps, checkScheduledUpdateOrContext(current2, renderLanes2))
            0 !== (current2.flags & 131072) && (didReceiveUpdate = true);
          else
            return workInProgress2.lanes = current2.lanes, bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
      }
      return updateFunctionComponent(
        current2,
        workInProgress2,
        Component,
        nextProps,
        renderLanes2
      );
    }
    function updateOffscreenComponent(current2, workInProgress2, renderLanes2, nextProps) {
      var nextChildren = nextProps.children, prevState = null !== current2 ? current2.memoizedState : null;
      null === current2 && null === workInProgress2.stateNode && (workInProgress2.stateNode = {
        _visibility: 1,
        _pendingMarkers: null,
        _retryCache: null,
        _transitions: null
      });
      if ("hidden" === nextProps.mode) {
        if (0 !== (workInProgress2.flags & 128)) {
          prevState = null !== prevState ? prevState.baseLanes | renderLanes2 : renderLanes2;
          if (null !== current2) {
            nextProps = workInProgress2.child = current2.child;
            for (nextChildren = 0; null !== nextProps; )
              nextChildren = nextChildren | nextProps.lanes | nextProps.childLanes, nextProps = nextProps.sibling;
            nextProps = nextChildren & ~prevState;
          } else nextProps = 0, workInProgress2.child = null;
          return deferHiddenOffscreenComponent(
            current2,
            workInProgress2,
            prevState,
            renderLanes2,
            nextProps
          );
        }
        if (0 !== (renderLanes2 & 536870912))
          workInProgress2.memoizedState = { baseLanes: 0, cachePool: null }, null !== current2 && pushTransition(
            workInProgress2,
            null !== prevState ? prevState.cachePool : null
          ), null !== prevState ? pushHiddenContext(workInProgress2, prevState) : reuseHiddenContextOnStack(), pushOffscreenSuspenseHandler(workInProgress2);
        else
          return nextProps = workInProgress2.lanes = 536870912, deferHiddenOffscreenComponent(
            current2,
            workInProgress2,
            null !== prevState ? prevState.baseLanes | renderLanes2 : renderLanes2,
            renderLanes2,
            nextProps
          );
      } else
        null !== prevState ? (pushTransition(workInProgress2, prevState.cachePool), pushHiddenContext(workInProgress2, prevState), reuseSuspenseHandlerOnStack(), workInProgress2.memoizedState = null) : (null !== current2 && pushTransition(workInProgress2, null), reuseHiddenContextOnStack(), reuseSuspenseHandlerOnStack());
      reconcileChildren(current2, workInProgress2, nextChildren, renderLanes2);
      return workInProgress2.child;
    }
    function bailoutOffscreenComponent(current2, workInProgress2) {
      null !== current2 && 22 === current2.tag || null !== workInProgress2.stateNode || (workInProgress2.stateNode = {
        _visibility: 1,
        _pendingMarkers: null,
        _retryCache: null,
        _transitions: null
      });
      return workInProgress2.sibling;
    }
    function deferHiddenOffscreenComponent(current2, workInProgress2, nextBaseLanes, renderLanes2, remainingChildLanes) {
      var JSCompiler_inline_result = peekCacheFromPool();
      JSCompiler_inline_result = null === JSCompiler_inline_result ? null : { parent: CacheContext._currentValue, pool: JSCompiler_inline_result };
      workInProgress2.memoizedState = {
        baseLanes: nextBaseLanes,
        cachePool: JSCompiler_inline_result
      };
      null !== current2 && pushTransition(workInProgress2, null);
      reuseHiddenContextOnStack();
      pushOffscreenSuspenseHandler(workInProgress2);
      null !== current2 && propagateParentContextChanges(current2, workInProgress2, renderLanes2, true);
      workInProgress2.childLanes = remainingChildLanes;
      return null;
    }
    function mountActivityChildren(workInProgress2, nextProps) {
      nextProps = mountWorkInProgressOffscreenFiber(
        { mode: nextProps.mode, children: nextProps.children },
        workInProgress2.mode
      );
      nextProps.ref = workInProgress2.ref;
      workInProgress2.child = nextProps;
      nextProps.return = workInProgress2;
      return nextProps;
    }
    function retryActivityComponentWithoutHydrating(current2, workInProgress2, renderLanes2) {
      reconcileChildFibers(workInProgress2, current2.child, null, renderLanes2);
      current2 = mountActivityChildren(workInProgress2, workInProgress2.pendingProps);
      current2.flags |= 2;
      popSuspenseHandler(workInProgress2);
      workInProgress2.memoizedState = null;
      return current2;
    }
    function updateActivityComponent(current2, workInProgress2, renderLanes2) {
      var nextProps = workInProgress2.pendingProps, didSuspend = 0 !== (workInProgress2.flags & 128);
      workInProgress2.flags &= -129;
      if (null === current2) {
        if (isHydrating) {
          if ("hidden" === nextProps.mode)
            return current2 = mountActivityChildren(workInProgress2, nextProps), workInProgress2.lanes = 536870912, current2.memoizedState = { baseLanes: 0, cachePool: null }, bailoutOffscreenComponent(null, current2);
          pushDehydratedActivitySuspenseHandler(workInProgress2);
          (current2 = nextHydratableInstance) ? (current2 = canHydrateHydrationBoundary(
            current2,
            rootOrSingletonContext
          ), current2 = null !== current2 && "&" === current2.data ? current2 : null, null !== current2 && (workInProgress2.memoizedState = {
            dehydrated: current2,
            treeContext: null !== treeContextProvider ? { id: treeContextId, overflow: treeContextOverflow } : null,
            retryLane: 536870912,
            hydrationErrors: null
          }, renderLanes2 = createFiberFromDehydratedFragment(current2), renderLanes2.return = workInProgress2, workInProgress2.child = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null)) : current2 = null;
          if (null === current2) throw throwOnHydrationMismatch(workInProgress2);
          workInProgress2.lanes = 536870912;
          return null;
        }
        return mountActivityChildren(workInProgress2, nextProps);
      }
      var prevState = current2.memoizedState;
      if (null !== prevState) {
        var dehydrated = prevState.dehydrated;
        pushDehydratedActivitySuspenseHandler(workInProgress2);
        if (didSuspend)
          if (workInProgress2.flags & 256)
            workInProgress2.flags &= -257, workInProgress2 = retryActivityComponentWithoutHydrating(
              current2,
              workInProgress2,
              renderLanes2
            );
          else if (null !== workInProgress2.memoizedState)
            workInProgress2.child = current2.child, workInProgress2.flags |= 128, workInProgress2 = null;
          else throw Error(formatProdErrorMessage(558));
        else if (didReceiveUpdate || propagateParentContextChanges(current2, workInProgress2, renderLanes2, false), didSuspend = 0 !== (renderLanes2 & current2.childLanes), didReceiveUpdate || didSuspend) {
          if (null === currentTreeHiddenStackCursor.current) {
            nextProps = workInProgressRoot;
            if (null !== nextProps && (dehydrated = getBumpedLaneForHydration(nextProps, renderLanes2), 0 !== dehydrated && dehydrated !== prevState.retryLane))
              throw prevState.retryLane = dehydrated, enqueueConcurrentRenderForLane(current2, dehydrated), scheduleUpdateOnFiber(nextProps, current2, dehydrated), SelectiveHydrationException;
            renderDidSuspendDelayIfPossible();
          }
          workInProgress2 = retryActivityComponentWithoutHydrating(
            current2,
            workInProgress2,
            renderLanes2
          );
        } else
          current2 = prevState.treeContext, nextHydratableInstance = getNextHydratable(dehydrated.nextSibling), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = false, null !== current2 && restoreSuspendedTreeContext(workInProgress2, current2), workInProgress2 = mountActivityChildren(workInProgress2, nextProps), workInProgress2.flags |= 134221824;
        return workInProgress2;
      }
      current2 = createWorkInProgress(current2.child, {
        mode: nextProps.mode,
        children: nextProps.children
      });
      current2.ref = workInProgress2.ref;
      workInProgress2.child = current2;
      current2.return = workInProgress2;
      return current2;
    }
    function markRef(current2, workInProgress2) {
      var ref = workInProgress2.ref;
      if (null === ref)
        null !== current2 && null !== current2.ref && (workInProgress2.flags |= 4194816);
      else {
        if ("function" !== typeof ref && "object" !== typeof ref)
          throw Error(formatProdErrorMessage(284));
        if (null === current2 || current2.ref !== ref)
          workInProgress2.flags |= 4194816;
      }
    }
    function updateFunctionComponent(current2, workInProgress2, Component, nextProps, renderLanes2) {
      prepareToReadContext(workInProgress2);
      Component = renderWithHooks(
        current2,
        workInProgress2,
        Component,
        nextProps,
        void 0,
        renderLanes2
      );
      nextProps = checkDidRenderIdHook();
      if (null !== current2 && !didReceiveUpdate)
        return bailoutHooks(current2, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
      isHydrating && nextProps && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current2, workInProgress2, Component, renderLanes2);
      return workInProgress2.child;
    }
    function replayFunctionComponent(current2, workInProgress2, nextProps, Component, secondArg, renderLanes2) {
      prepareToReadContext(workInProgress2);
      workInProgress2.updateQueue = null;
      nextProps = renderWithHooksAgain(
        workInProgress2,
        Component,
        nextProps,
        secondArg
      );
      finishRenderingHooks(current2);
      Component = checkDidRenderIdHook();
      if (null !== current2 && !didReceiveUpdate)
        return bailoutHooks(current2, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
      isHydrating && Component && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current2, workInProgress2, nextProps, renderLanes2);
      return workInProgress2.child;
    }
    function updateClassComponent(current2, workInProgress2, Component, nextProps, renderLanes2) {
      prepareToReadContext(workInProgress2);
      if (null === workInProgress2.stateNode) {
        var context = emptyContextObject, contextType = Component.contextType;
        "object" === typeof contextType && null !== contextType && (context = readContext(contextType));
        context = new Component(nextProps, context);
        workInProgress2.memoizedState = null !== context.state && void 0 !== context.state ? context.state : null;
        context.updater = classComponentUpdater;
        workInProgress2.stateNode = context;
        context._reactInternals = workInProgress2;
        context = workInProgress2.stateNode;
        context.props = nextProps;
        context.state = workInProgress2.memoizedState;
        context.refs = {};
        initializeUpdateQueue(workInProgress2);
        contextType = Component.contextType;
        context.context = "object" === typeof contextType && null !== contextType ? readContext(contextType) : emptyContextObject;
        context.state = workInProgress2.memoizedState;
        contextType = Component.getDerivedStateFromProps;
        "function" === typeof contextType && (applyDerivedStateFromProps(
          workInProgress2,
          Component,
          contextType,
          nextProps
        ), context.state = workInProgress2.memoizedState);
        "function" === typeof Component.getDerivedStateFromProps || "function" === typeof context.getSnapshotBeforeUpdate || "function" !== typeof context.UNSAFE_componentWillMount && "function" !== typeof context.componentWillMount || (contextType = context.state, "function" === typeof context.componentWillMount && context.componentWillMount(), "function" === typeof context.UNSAFE_componentWillMount && context.UNSAFE_componentWillMount(), contextType !== context.state && classComponentUpdater.enqueueReplaceState(context, context.state, null), processUpdateQueue(workInProgress2, nextProps, context, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction(), context.state = workInProgress2.memoizedState);
        "function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308);
        nextProps = true;
      } else if (null === current2) {
        context = workInProgress2.stateNode;
        var unresolvedOldProps = workInProgress2.memoizedProps, oldProps = resolveClassComponentProps(Component, unresolvedOldProps);
        context.props = oldProps;
        var oldContext = context.context, contextType$jscomp$0 = Component.contextType;
        contextType = emptyContextObject;
        "object" === typeof contextType$jscomp$0 && null !== contextType$jscomp$0 && (contextType = readContext(contextType$jscomp$0));
        var getDerivedStateFromProps = Component.getDerivedStateFromProps;
        contextType$jscomp$0 = "function" === typeof getDerivedStateFromProps || "function" === typeof context.getSnapshotBeforeUpdate;
        unresolvedOldProps = workInProgress2.pendingProps !== unresolvedOldProps;
        contextType$jscomp$0 || "function" !== typeof context.UNSAFE_componentWillReceiveProps && "function" !== typeof context.componentWillReceiveProps || (unresolvedOldProps || oldContext !== contextType) && callComponentWillReceiveProps(
          workInProgress2,
          context,
          nextProps,
          contextType
        );
        hasForceUpdate = false;
        var oldState = workInProgress2.memoizedState;
        context.state = oldState;
        processUpdateQueue(workInProgress2, nextProps, context, renderLanes2);
        suspendIfUpdateReadFromEntangledAsyncAction();
        oldContext = workInProgress2.memoizedState;
        unresolvedOldProps || oldState !== oldContext || hasForceUpdate ? ("function" === typeof getDerivedStateFromProps && (applyDerivedStateFromProps(
          workInProgress2,
          Component,
          getDerivedStateFromProps,
          nextProps
        ), oldContext = workInProgress2.memoizedState), (oldProps = hasForceUpdate || checkShouldComponentUpdate(
          workInProgress2,
          Component,
          oldProps,
          nextProps,
          oldState,
          oldContext,
          contextType
        )) ? (contextType$jscomp$0 || "function" !== typeof context.UNSAFE_componentWillMount && "function" !== typeof context.componentWillMount || ("function" === typeof context.componentWillMount && context.componentWillMount(), "function" === typeof context.UNSAFE_componentWillMount && context.UNSAFE_componentWillMount()), "function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308)) : ("function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = oldContext), context.props = nextProps, context.state = oldContext, context.context = contextType, nextProps = oldProps) : ("function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308), nextProps = false);
      } else {
        context = workInProgress2.stateNode;
        cloneUpdateQueue(current2, workInProgress2);
        contextType = workInProgress2.memoizedProps;
        contextType$jscomp$0 = resolveClassComponentProps(Component, contextType);
        context.props = contextType$jscomp$0;
        getDerivedStateFromProps = workInProgress2.pendingProps;
        oldState = context.context;
        oldContext = Component.contextType;
        oldProps = emptyContextObject;
        "object" === typeof oldContext && null !== oldContext && (oldProps = readContext(oldContext));
        unresolvedOldProps = Component.getDerivedStateFromProps;
        (oldContext = "function" === typeof unresolvedOldProps || "function" === typeof context.getSnapshotBeforeUpdate) || "function" !== typeof context.UNSAFE_componentWillReceiveProps && "function" !== typeof context.componentWillReceiveProps || (contextType !== getDerivedStateFromProps || oldState !== oldProps) && callComponentWillReceiveProps(
          workInProgress2,
          context,
          nextProps,
          oldProps
        );
        hasForceUpdate = false;
        oldState = workInProgress2.memoizedState;
        context.state = oldState;
        processUpdateQueue(workInProgress2, nextProps, context, renderLanes2);
        suspendIfUpdateReadFromEntangledAsyncAction();
        var newState = workInProgress2.memoizedState;
        contextType !== getDerivedStateFromProps || oldState !== newState || hasForceUpdate || null !== current2 && null !== current2.dependencies && checkIfContextChanged(current2.dependencies) ? ("function" === typeof unresolvedOldProps && (applyDerivedStateFromProps(
          workInProgress2,
          Component,
          unresolvedOldProps,
          nextProps
        ), newState = workInProgress2.memoizedState), (contextType$jscomp$0 = hasForceUpdate || checkShouldComponentUpdate(
          workInProgress2,
          Component,
          contextType$jscomp$0,
          nextProps,
          oldState,
          newState,
          oldProps
        ) || null !== current2 && null !== current2.dependencies && checkIfContextChanged(current2.dependencies)) ? (oldContext || "function" !== typeof context.UNSAFE_componentWillUpdate && "function" !== typeof context.componentWillUpdate || ("function" === typeof context.componentWillUpdate && context.componentWillUpdate(nextProps, newState, oldProps), "function" === typeof context.UNSAFE_componentWillUpdate && context.UNSAFE_componentWillUpdate(
          nextProps,
          newState,
          oldProps
        )), "function" === typeof context.componentDidUpdate && (workInProgress2.flags |= 4), "function" === typeof context.getSnapshotBeforeUpdate && (workInProgress2.flags |= 1024)) : ("function" !== typeof context.componentDidUpdate || contextType === current2.memoizedProps && oldState === current2.memoizedState || (workInProgress2.flags |= 4), "function" !== typeof context.getSnapshotBeforeUpdate || contextType === current2.memoizedProps && oldState === current2.memoizedState || (workInProgress2.flags |= 1024), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = newState), context.props = nextProps, context.state = newState, context.context = oldProps, nextProps = contextType$jscomp$0) : ("function" !== typeof context.componentDidUpdate || contextType === current2.memoizedProps && oldState === current2.memoizedState || (workInProgress2.flags |= 4), "function" !== typeof context.getSnapshotBeforeUpdate || contextType === current2.memoizedProps && oldState === current2.memoizedState || (workInProgress2.flags |= 1024), nextProps = false);
      }
      context = nextProps;
      markRef(current2, workInProgress2);
      nextProps = 0 !== (workInProgress2.flags & 128);
      context || nextProps ? (context = workInProgress2.stateNode, Component = nextProps && "function" !== typeof Component.getDerivedStateFromError ? null : context.render(), workInProgress2.flags |= 1, null !== current2 && nextProps ? (workInProgress2.child = reconcileChildFibers(
        workInProgress2,
        current2.child,
        null,
        renderLanes2
      ), workInProgress2.child = reconcileChildFibers(
        workInProgress2,
        null,
        Component,
        renderLanes2
      )) : reconcileChildren(current2, workInProgress2, Component, renderLanes2), workInProgress2.memoizedState = context.state, current2 = workInProgress2.child) : current2 = bailoutOnAlreadyFinishedWork(
        current2,
        workInProgress2,
        renderLanes2
      );
      return current2;
    }
    function mountHostRootWithoutHydrating(current2, workInProgress2, nextChildren, renderLanes2) {
      resetHydrationState();
      workInProgress2.flags |= 256;
      reconcileChildren(current2, workInProgress2, nextChildren, renderLanes2);
      return workInProgress2.child;
    }
    var SUSPENDED_MARKER = {
      dehydrated: null,
      treeContext: null,
      retryLane: 0,
      hydrationErrors: null
    };
    function mountSuspenseOffscreenState(renderLanes2) {
      return { baseLanes: renderLanes2, cachePool: getSuspendedCache() };
    }
    function getRemainingWorkInPrimaryTree(current2, primaryTreeDidDefer, renderLanes2) {
      current2 = null !== current2 ? current2.childLanes & ~renderLanes2 : 0;
      primaryTreeDidDefer && (current2 |= workInProgressDeferredLane);
      return current2;
    }
    function updateSuspenseComponent(current2, workInProgress2, renderLanes2) {
      var nextProps = workInProgress2.pendingProps, showFallback = false, didSuspend = 0 !== (workInProgress2.flags & 128), JSCompiler_temp;
      (JSCompiler_temp = didSuspend) || (JSCompiler_temp = null !== current2 && null === current2.memoizedState ? false : 0 !== (suspenseStackCursor.current & 2));
      JSCompiler_temp && (showFallback = true, workInProgress2.flags &= -129);
      JSCompiler_temp = 0 !== (workInProgress2.flags & 32);
      workInProgress2.flags &= -33;
      if (null === current2) {
        if (isHydrating) {
          showFallback ? pushPrimaryTreeSuspenseHandler(workInProgress2) : reuseSuspenseHandlerOnStack();
          (current2 = nextHydratableInstance) ? (current2 = canHydrateHydrationBoundary(
            current2,
            rootOrSingletonContext
          ), current2 = null !== current2 && "&" !== current2.data ? current2 : null, null !== current2 && (workInProgress2.memoizedState = {
            dehydrated: current2,
            treeContext: null !== treeContextProvider ? { id: treeContextId, overflow: treeContextOverflow } : null,
            retryLane: 536870912,
            hydrationErrors: null
          }, renderLanes2 = createFiberFromDehydratedFragment(current2), renderLanes2.return = workInProgress2, workInProgress2.child = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null)) : current2 = null;
          if (null === current2) throw throwOnHydrationMismatch(workInProgress2);
          isSuspenseInstanceFallback(current2) ? workInProgress2.lanes = 32 : workInProgress2.lanes = 536870912;
          return null;
        }
        didSuspend = nextProps.children;
        nextProps = nextProps.fallback;
        if (showFallback)
          return reuseSuspenseHandlerOnStack(), showFallback = workInProgress2.mode, didSuspend = mountWorkInProgressOffscreenFiber(
            { mode: "hidden", children: didSuspend },
            showFallback
          ), nextProps = createFiberFromFragment(
            nextProps,
            showFallback,
            renderLanes2,
            null
          ), didSuspend.return = workInProgress2, nextProps.return = workInProgress2, didSuspend.sibling = nextProps, workInProgress2.child = didSuspend, nextProps = workInProgress2.child, nextProps.memoizedState = mountSuspenseOffscreenState(renderLanes2), nextProps.childLanes = getRemainingWorkInPrimaryTree(
            current2,
            JSCompiler_temp,
            renderLanes2
          ), workInProgress2.memoizedState = SUSPENDED_MARKER, bailoutOffscreenComponent(null, nextProps);
        pushPrimaryTreeSuspenseHandler(workInProgress2);
        return mountSuspensePrimaryChildren(workInProgress2, didSuspend);
      }
      var prevState = current2.memoizedState;
      if (null !== prevState) {
        var dehydrated$96 = prevState.dehydrated;
        if (null !== dehydrated$96)
          return updateDehydratedSuspenseComponent(
            current2,
            workInProgress2,
            didSuspend,
            JSCompiler_temp,
            nextProps,
            dehydrated$96,
            prevState,
            renderLanes2
          );
      }
      if (showFallback)
        return reuseSuspenseHandlerOnStack(), showFallback = nextProps.fallback, didSuspend = workInProgress2.mode, prevState = current2.child, dehydrated$96 = prevState.sibling, nextProps = createWorkInProgress(prevState, {
          mode: "hidden",
          children: nextProps.children
        }), nextProps.subtreeFlags = prevState.subtreeFlags & 1206910976, null !== dehydrated$96 ? showFallback = createWorkInProgress(dehydrated$96, showFallback) : (showFallback = createFiberFromFragment(
          showFallback,
          didSuspend,
          renderLanes2,
          null
        ), showFallback.flags |= 2), showFallback.return = workInProgress2, nextProps.return = workInProgress2, nextProps.sibling = showFallback, workInProgress2.child = nextProps, bailoutOffscreenComponent(null, nextProps), nextProps = workInProgress2.child, showFallback = current2.child.memoizedState, null === showFallback ? showFallback = mountSuspenseOffscreenState(renderLanes2) : (didSuspend = showFallback.cachePool, null !== didSuspend ? (prevState = CacheContext._currentValue, didSuspend = didSuspend.parent !== prevState ? { parent: prevState, pool: prevState } : didSuspend) : didSuspend = getSuspendedCache(), showFallback = {
          baseLanes: showFallback.baseLanes | renderLanes2,
          cachePool: didSuspend
        }), nextProps.memoizedState = showFallback, nextProps.childLanes = getRemainingWorkInPrimaryTree(
          current2,
          JSCompiler_temp,
          renderLanes2
        ), workInProgress2.memoizedState = SUSPENDED_MARKER, bailoutOffscreenComponent(current2.child, nextProps);
      pushPrimaryTreeSuspenseHandler(workInProgress2);
      renderLanes2 = current2.child;
      current2 = renderLanes2.sibling;
      renderLanes2 = createWorkInProgress(renderLanes2, {
        mode: "visible",
        children: nextProps.children
      });
      renderLanes2.return = workInProgress2;
      renderLanes2.sibling = null;
      null !== current2 && (JSCompiler_temp = workInProgress2.deletions, null === JSCompiler_temp ? (workInProgress2.deletions = [current2], workInProgress2.flags |= 16) : JSCompiler_temp.push(current2));
      workInProgress2.child = renderLanes2;
      workInProgress2.memoizedState = null;
      return renderLanes2;
    }
    function mountSuspensePrimaryChildren(workInProgress2, primaryChildren) {
      primaryChildren = mountWorkInProgressOffscreenFiber(
        { mode: "visible", children: primaryChildren },
        workInProgress2.mode
      );
      primaryChildren.return = workInProgress2;
      return workInProgress2.child = primaryChildren;
    }
    function mountWorkInProgressOffscreenFiber(offscreenProps, mode) {
      offscreenProps = createFiberImplClass(22, offscreenProps, null, mode);
      offscreenProps.lanes = 0;
      return offscreenProps;
    }
    function retrySuspenseComponentWithoutHydrating(current2, workInProgress2, renderLanes2) {
      reconcileChildFibers(workInProgress2, current2.child, null, renderLanes2);
      current2 = mountSuspensePrimaryChildren(
        workInProgress2,
        workInProgress2.pendingProps.children
      );
      current2.flags |= 2;
      workInProgress2.memoizedState = null;
      return current2;
    }
    function updateDehydratedSuspenseComponent(current2, workInProgress2, didSuspend, didPrimaryChildrenDefer, nextProps, suspenseInstance, suspenseState, renderLanes2) {
      if (didSuspend) {
        if (workInProgress2.flags & 256)
          return pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags &= -257, retrySuspenseComponentWithoutHydrating(
            current2,
            workInProgress2,
            renderLanes2
          );
        if (null !== workInProgress2.memoizedState)
          return reuseSuspenseHandlerOnStack(), workInProgress2.child = current2.child, workInProgress2.flags |= 128, null;
        reuseSuspenseHandlerOnStack();
        suspenseInstance = nextProps.fallback;
        suspenseState = workInProgress2.mode;
        nextProps = mountWorkInProgressOffscreenFiber(
          { mode: "visible", children: nextProps.children },
          suspenseState
        );
        suspenseInstance = createFiberFromFragment(
          suspenseInstance,
          suspenseState,
          renderLanes2,
          null
        );
        suspenseInstance.flags |= 2;
        nextProps.return = workInProgress2;
        suspenseInstance.return = workInProgress2;
        nextProps.sibling = suspenseInstance;
        workInProgress2.child = nextProps;
        reconcileChildFibers(workInProgress2, current2.child, null, renderLanes2);
        nextProps = workInProgress2.child;
        nextProps.memoizedState = mountSuspenseOffscreenState(renderLanes2);
        nextProps.childLanes = getRemainingWorkInPrimaryTree(
          current2,
          didPrimaryChildrenDefer,
          renderLanes2
        );
        workInProgress2.memoizedState = SUSPENDED_MARKER;
        return bailoutOffscreenComponent(null, nextProps);
      }
      pushPrimaryTreeSuspenseHandler(workInProgress2);
      if (isSuspenseInstanceFallback(suspenseInstance)) {
        didPrimaryChildrenDefer = suspenseInstance.nextSibling && suspenseInstance.nextSibling.dataset;
        if (didPrimaryChildrenDefer) var digest = didPrimaryChildrenDefer.dgst;
        didPrimaryChildrenDefer = digest;
        "" !== didPrimaryChildrenDefer && (nextProps = Error(formatProdErrorMessage(419)), nextProps.stack = "", nextProps.digest = didPrimaryChildrenDefer, queueHydrationError({ value: nextProps, source: null, stack: null }));
        return retrySuspenseComponentWithoutHydrating(
          current2,
          workInProgress2,
          renderLanes2
        );
      }
      didReceiveUpdate || propagateParentContextChanges(current2, workInProgress2, renderLanes2, false);
      didPrimaryChildrenDefer = 0 !== (renderLanes2 & current2.childLanes);
      if (didReceiveUpdate || didPrimaryChildrenDefer) {
        if (null !== currentTreeHiddenStackCursor.current)
          return retrySuspenseComponentWithoutHydrating(
            current2,
            workInProgress2,
            renderLanes2
          );
        didPrimaryChildrenDefer = workInProgressRoot;
        if (null !== didPrimaryChildrenDefer && (nextProps = getBumpedLaneForHydration(
          didPrimaryChildrenDefer,
          renderLanes2
        ), 0 !== nextProps && nextProps !== suspenseState.retryLane))
          throw suspenseState.retryLane = nextProps, enqueueConcurrentRenderForLane(current2, nextProps), scheduleUpdateOnFiber(didPrimaryChildrenDefer, current2, nextProps), SelectiveHydrationException;
        isSuspenseInstancePending(suspenseInstance) || renderDidSuspendDelayIfPossible();
        return retrySuspenseComponentWithoutHydrating(
          current2,
          workInProgress2,
          renderLanes2
        );
      }
      if (isSuspenseInstancePending(suspenseInstance))
        return workInProgress2.flags |= 192, workInProgress2.child = current2.child, null;
      current2 = suspenseState.treeContext;
      nextHydratableInstance = getNextHydratable(suspenseInstance.nextSibling);
      hydrationParentFiber = workInProgress2;
      isHydrating = true;
      hydrationErrors = null;
      rootOrSingletonContext = false;
      null !== current2 && restoreSuspendedTreeContext(workInProgress2, current2);
      workInProgress2 = mountSuspensePrimaryChildren(
        workInProgress2,
        nextProps.children
      );
      workInProgress2.flags |= 134221824;
      return workInProgress2;
    }
    function scheduleSuspenseWorkOnFiber(fiber, renderLanes2, propagationRoot) {
      fiber.lanes |= renderLanes2;
      var alternate = fiber.alternate;
      null !== alternate && (alternate.lanes |= renderLanes2);
      scheduleContextWorkOnParentPath(fiber.return, renderLanes2, propagationRoot);
    }
    function findLastContentRow(firstChild) {
      for (var lastContentRow = null; null !== firstChild; ) {
        var currentRow = firstChild.alternate;
        null !== currentRow && null === findFirstSuspended(currentRow) && (lastContentRow = firstChild);
        firstChild = firstChild.sibling;
      }
      return lastContentRow;
    }
    function initSuspenseListRenderState(workInProgress2, isBackwards, tail, lastContentRow, tailMode, treeForkCount2) {
      var renderState = workInProgress2.memoizedState;
      null === renderState ? workInProgress2.memoizedState = {
        isBackwards,
        rendering: null,
        renderingStartTime: 0,
        last: lastContentRow,
        tail,
        tailMode,
        treeForkCount: treeForkCount2
      } : (renderState.isBackwards = isBackwards, renderState.rendering = null, renderState.renderingStartTime = 0, renderState.last = lastContentRow, renderState.tail = tail, renderState.tailMode = tailMode, renderState.treeForkCount = treeForkCount2);
    }
    function reverseChildren(fiber) {
      var row = fiber.child;
      for (fiber.child = null; null !== row; ) {
        var nextRow = row.sibling;
        row.sibling = fiber.child;
        fiber.child = row;
        row = nextRow;
      }
    }
    function updateSuspenseListComponent(current2, workInProgress2, renderLanes2) {
      var nextProps = workInProgress2.pendingProps, revealOrder = nextProps.revealOrder, tailMode = nextProps.tail;
      nextProps = nextProps.children;
      var suspenseContext = suspenseStackCursor.current;
      if (workInProgress2.flags & 128)
        return pushSuspenseListContext(workInProgress2, suspenseContext), null;
      var shouldForceFallback = 0 !== (suspenseContext & 2);
      shouldForceFallback ? (suspenseContext = suspenseContext & 1 | 2, workInProgress2.flags |= 128) : suspenseContext &= 1;
      pushSuspenseListContext(workInProgress2, suspenseContext);
      "backwards" === revealOrder && null !== current2 ? (reverseChildren(current2), reconcileChildren(current2, workInProgress2, nextProps, renderLanes2), reverseChildren(current2)) : reconcileChildren(current2, workInProgress2, nextProps, renderLanes2);
      nextProps = isHydrating ? treeForkCount : 0;
      if (!shouldForceFallback && null !== current2 && 0 !== (current2.flags & 128))
        a: for (current2 = workInProgress2.child; null !== current2; ) {
          if (13 === current2.tag)
            null !== current2.memoizedState && scheduleSuspenseWorkOnFiber(current2, renderLanes2, workInProgress2);
          else if (19 === current2.tag)
            scheduleSuspenseWorkOnFiber(current2, renderLanes2, workInProgress2);
          else if (null !== current2.child) {
            current2.child.return = current2;
            current2 = current2.child;
            continue;
          }
          if (current2 === workInProgress2) break a;
          for (; null === current2.sibling; ) {
            if (null === current2.return || current2.return === workInProgress2)
              break a;
            current2 = current2.return;
          }
          current2.sibling.return = current2.return;
          current2 = current2.sibling;
        }
      switch (revealOrder) {
        case "backwards":
          renderLanes2 = findLastContentRow(workInProgress2.child);
          null === renderLanes2 ? (revealOrder = workInProgress2.child, workInProgress2.child = null) : (revealOrder = renderLanes2.sibling, renderLanes2.sibling = null, reverseChildren(workInProgress2));
          initSuspenseListRenderState(
            workInProgress2,
            true,
            revealOrder,
            null,
            tailMode,
            nextProps
          );
          break;
        case "unstable_legacy-backwards":
          renderLanes2 = null;
          revealOrder = workInProgress2.child;
          for (workInProgress2.child = null; null !== revealOrder; ) {
            current2 = revealOrder.alternate;
            if (null !== current2 && null === findFirstSuspended(current2)) {
              workInProgress2.child = revealOrder;
              break;
            }
            current2 = revealOrder.sibling;
            revealOrder.sibling = renderLanes2;
            renderLanes2 = revealOrder;
            revealOrder = current2;
          }
          initSuspenseListRenderState(
            workInProgress2,
            true,
            renderLanes2,
            null,
            tailMode,
            nextProps
          );
          break;
        case "together":
          initSuspenseListRenderState(
            workInProgress2,
            false,
            null,
            null,
            void 0,
            nextProps
          );
          break;
        case "independent":
          workInProgress2.memoizedState = null;
          break;
        default:
          renderLanes2 = findLastContentRow(workInProgress2.child), null === renderLanes2 ? (revealOrder = workInProgress2.child, workInProgress2.child = null) : (revealOrder = renderLanes2.sibling, renderLanes2.sibling = null), initSuspenseListRenderState(
            workInProgress2,
            false,
            revealOrder,
            renderLanes2,
            tailMode,
            nextProps
          );
      }
      return workInProgress2.child;
    }
    function updateContextProvider(current2, workInProgress2, renderLanes2) {
      var newProps = workInProgress2.pendingProps;
      pushProvider(workInProgress2, workInProgress2.type, newProps.value);
      reconcileChildren(current2, workInProgress2, newProps.children, renderLanes2);
      return workInProgress2.child;
    }
    function bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2) {
      null !== current2 && (workInProgress2.dependencies = current2.dependencies);
      workInProgressRootSkippedLanes |= workInProgress2.lanes;
      if (0 === (renderLanes2 & workInProgress2.childLanes))
        if (null !== current2) {
          if (propagateParentContextChanges(
            current2,
            workInProgress2,
            renderLanes2,
            false
          ), 0 === (renderLanes2 & workInProgress2.childLanes))
            return null;
        } else return null;
      if (null !== current2 && workInProgress2.child !== current2.child)
        throw Error(formatProdErrorMessage(153));
      if (null !== workInProgress2.child) {
        current2 = workInProgress2.child;
        renderLanes2 = createWorkInProgress(current2, current2.pendingProps);
        workInProgress2.child = renderLanes2;
        for (renderLanes2.return = workInProgress2; null !== current2.sibling; )
          current2 = current2.sibling, renderLanes2 = renderLanes2.sibling = createWorkInProgress(current2, current2.pendingProps), renderLanes2.return = workInProgress2;
        renderLanes2.sibling = null;
      }
      return workInProgress2.child;
    }
    function checkScheduledUpdateOrContext(current2, renderLanes2) {
      if (0 !== (current2.lanes & renderLanes2)) return true;
      current2 = current2.dependencies;
      return null !== current2 && checkIfContextChanged(current2) ? true : false;
    }
    function attemptEarlyBailoutIfNoScheduledUpdate(current2, workInProgress2, renderLanes2) {
      switch (workInProgress2.tag) {
        case 3:
          pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
          pushProvider(workInProgress2, CacheContext, current2.memoizedState.cache);
          resetHydrationState();
          break;
        case 27:
        case 5:
          pushHostContext(workInProgress2);
          break;
        case 4:
          pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
          break;
        case 10:
          pushProvider(
            workInProgress2,
            workInProgress2.type,
            workInProgress2.memoizedProps.value
          );
          break;
        case 31:
          if (null !== workInProgress2.memoizedState)
            return workInProgress2.flags |= 128, pushDehydratedActivitySuspenseHandler(workInProgress2), null;
          break;
        case 13:
          var state$108 = workInProgress2.memoizedState;
          if (null !== state$108) {
            if (null !== state$108.dehydrated)
              return pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags |= 128, null;
            state$108 = propagateParentContextChanges(
              current2,
              workInProgress2,
              renderLanes2,
              false
            );
            var primaryChildLanes = workInProgress2.child.childLanes;
            if (state$108 || 0 !== (renderLanes2 & primaryChildLanes))
              return updateSuspenseComponent(current2, workInProgress2, renderLanes2);
            pushPrimaryTreeSuspenseHandler(workInProgress2);
            current2 = bailoutOnAlreadyFinishedWork(
              current2,
              workInProgress2,
              renderLanes2
            );
            return null !== current2 ? current2.sibling : null;
          }
          pushPrimaryTreeSuspenseHandler(workInProgress2);
          break;
        case 19:
          if (workInProgress2.flags & 128)
            return updateSuspenseListComponent(
              current2,
              workInProgress2,
              renderLanes2
            );
          primaryChildLanes = 0 !== (current2.flags & 128);
          state$108 = 0 !== (renderLanes2 & workInProgress2.childLanes);
          state$108 || (propagateParentContextChanges(
            current2,
            workInProgress2,
            renderLanes2,
            false
          ), state$108 = 0 !== (renderLanes2 & workInProgress2.childLanes));
          if (primaryChildLanes) {
            if (state$108)
              return updateSuspenseListComponent(
                current2,
                workInProgress2,
                renderLanes2
              );
            workInProgress2.flags |= 128;
          }
          primaryChildLanes = workInProgress2.memoizedState;
          null !== primaryChildLanes && (primaryChildLanes.rendering = null, primaryChildLanes.tail = null, primaryChildLanes.lastEffect = null);
          pushSuspenseListContext(workInProgress2, suspenseStackCursor.current);
          if (state$108) break;
          else return null;
        case 22:
          return workInProgress2.lanes = 0, updateOffscreenComponent(
            current2,
            workInProgress2,
            renderLanes2,
            workInProgress2.pendingProps
          );
        case 24:
          pushProvider(workInProgress2, CacheContext, current2.memoizedState.cache);
      }
      return bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
    }
    function beginWork(current2, workInProgress2, renderLanes2) {
      if (null !== current2)
        if (current2.memoizedProps !== workInProgress2.pendingProps)
          didReceiveUpdate = true;
        else {
          if (!checkScheduledUpdateOrContext(current2, renderLanes2) && 0 === (workInProgress2.flags & 128))
            return didReceiveUpdate = false, attemptEarlyBailoutIfNoScheduledUpdate(
              current2,
              workInProgress2,
              renderLanes2
            );
          didReceiveUpdate = 0 !== (current2.flags & 131072) ? true : false;
        }
      else
        didReceiveUpdate = false, isHydrating && 0 !== (workInProgress2.flags & 1048576) && pushTreeId(workInProgress2, treeForkCount, workInProgress2.index);
      workInProgress2.lanes = 0;
      switch (workInProgress2.tag) {
        case 16:
          a: {
            var props = workInProgress2.pendingProps;
            current2 = resolveLazy(workInProgress2.elementType);
            workInProgress2.type = current2;
            if ("function" === typeof current2)
              shouldConstruct(current2) ? (props = resolveClassComponentProps(current2, props), workInProgress2.tag = 1, workInProgress2 = updateClassComponent(
                null,
                workInProgress2,
                current2,
                props,
                renderLanes2
              )) : (workInProgress2.tag = 0, workInProgress2 = updateFunctionComponent(
                null,
                workInProgress2,
                current2,
                props,
                renderLanes2
              ));
            else {
              if (void 0 !== current2 && null !== current2) {
                var $$typeof = current2.$$typeof;
                if ($$typeof === REACT_FORWARD_REF_TYPE) {
                  workInProgress2.tag = 11;
                  workInProgress2 = updateForwardRef(
                    null,
                    workInProgress2,
                    current2,
                    props,
                    renderLanes2
                  );
                  break a;
                } else if ($$typeof === REACT_MEMO_TYPE) {
                  workInProgress2.tag = 14;
                  workInProgress2 = updateMemoComponent(
                    null,
                    workInProgress2,
                    current2,
                    props,
                    renderLanes2
                  );
                  break a;
                } else if ($$typeof === REACT_CONTEXT_TYPE) {
                  workInProgress2.tag = 10;
                  workInProgress2.type = current2;
                  workInProgress2 = updateContextProvider(
                    null,
                    workInProgress2,
                    renderLanes2
                  );
                  break a;
                }
              }
              workInProgress2 = getComponentNameFromType(current2) || current2;
              throw Error(formatProdErrorMessage(306, workInProgress2, ""));
            }
          }
          return workInProgress2;
        case 0:
          return updateFunctionComponent(
            current2,
            workInProgress2,
            workInProgress2.type,
            workInProgress2.pendingProps,
            renderLanes2
          );
        case 1:
          return props = workInProgress2.type, $$typeof = resolveClassComponentProps(
            props,
            workInProgress2.pendingProps
          ), updateClassComponent(
            current2,
            workInProgress2,
            props,
            $$typeof,
            renderLanes2
          );
        case 3:
          a: {
            pushHostContainer(
              workInProgress2,
              workInProgress2.stateNode.containerInfo
            );
            if (null === current2) throw Error(formatProdErrorMessage(387));
            props = workInProgress2.pendingProps;
            var prevState = workInProgress2.memoizedState;
            $$typeof = prevState.element;
            cloneUpdateQueue(current2, workInProgress2);
            processUpdateQueue(workInProgress2, props, null, renderLanes2);
            var nextState = workInProgress2.memoizedState;
            props = nextState.cache;
            pushProvider(workInProgress2, CacheContext, props);
            props !== prevState.cache && propagateContextChanges(
              workInProgress2,
              [CacheContext],
              renderLanes2,
              true
            );
            suspendIfUpdateReadFromEntangledAsyncAction();
            props = nextState.element;
            if (prevState.isDehydrated)
              if (prevState = {
                element: props,
                isDehydrated: false,
                cache: nextState.cache
              }, workInProgress2.updateQueue.baseState = prevState, workInProgress2.memoizedState = prevState, workInProgress2.flags & 256) {
                workInProgress2 = mountHostRootWithoutHydrating(
                  current2,
                  workInProgress2,
                  props,
                  renderLanes2
                );
                break a;
              } else if (props !== $$typeof) {
                $$typeof = createCapturedValueAtFiber(
                  Error(formatProdErrorMessage(424)),
                  workInProgress2
                );
                queueHydrationError($$typeof);
                workInProgress2 = mountHostRootWithoutHydrating(
                  current2,
                  workInProgress2,
                  props,
                  renderLanes2
                );
                break a;
              } else {
                current2 = workInProgress2.stateNode.containerInfo;
                switch (current2.nodeType) {
                  case 9:
                    current2 = current2.body;
                    break;
                  default:
                    current2 = "HTML" === current2.nodeName ? current2.ownerDocument.body : current2;
                }
                nextHydratableInstance = getNextHydratable(current2.firstChild);
                hydrationParentFiber = workInProgress2;
                isHydrating = true;
                hydrationErrors = null;
                rootOrSingletonContext = true;
                renderLanes2 = mountChildFibers(
                  workInProgress2,
                  null,
                  props,
                  renderLanes2
                );
                for (workInProgress2.child = renderLanes2; renderLanes2; )
                  renderLanes2.flags = renderLanes2.flags & -3 | 134221824, renderLanes2 = renderLanes2.sibling;
              }
            else {
              resetHydrationState();
              if (props === $$typeof) {
                workInProgress2 = bailoutOnAlreadyFinishedWork(
                  current2,
                  workInProgress2,
                  renderLanes2
                );
                break a;
              }
              reconcileChildren(current2, workInProgress2, props, renderLanes2);
            }
            workInProgress2 = workInProgress2.child;
          }
          return workInProgress2;
        case 26:
          return markRef(current2, workInProgress2), null === current2 ? (renderLanes2 = getResource(
            workInProgress2.type,
            null,
            workInProgress2.pendingProps,
            null
          )) ? workInProgress2.memoizedState = renderLanes2 : isHydrating || (workInProgress2.stateNode = createHoistableInstance(
            workInProgress2.type,
            workInProgress2.pendingProps,
            rootInstanceStackCursor.current,
            workInProgress2
          )) : workInProgress2.memoizedState = getResource(
            workInProgress2.type,
            current2.memoizedProps,
            workInProgress2.pendingProps,
            current2.memoizedState
          ), null;
        case 27:
          return pushHostContext(workInProgress2), null === current2 && isHydrating && (props = workInProgress2.stateNode = resolveSingletonInstance(
            workInProgress2.type,
            workInProgress2.pendingProps,
            rootInstanceStackCursor.current
          ), hydrationParentFiber = workInProgress2, rootOrSingletonContext = true, $$typeof = nextHydratableInstance, isSingletonScope(workInProgress2.type) ? (previousHydratableOnEnteringScopedSingleton = $$typeof, nextHydratableInstance = getNextHydratable(props.firstChild)) : nextHydratableInstance = $$typeof), reconcileChildren(
            current2,
            workInProgress2,
            workInProgress2.pendingProps.children,
            renderLanes2
          ), markRef(current2, workInProgress2), null === current2 && (workInProgress2.flags |= 4194304), workInProgress2.child;
        case 5:
          if (null === current2 && isHydrating) {
            if ($$typeof = props = nextHydratableInstance)
              props = canHydrateInstance(
                props,
                workInProgress2.type,
                workInProgress2.pendingProps,
                rootOrSingletonContext
              ), null !== props ? (workInProgress2.stateNode = props, hydrationParentFiber = workInProgress2, nextHydratableInstance = getNextHydratable(props.firstChild), rootOrSingletonContext = false, $$typeof = true) : $$typeof = false;
            $$typeof || throwOnHydrationMismatch(workInProgress2);
          }
          pushHostContext(workInProgress2);
          $$typeof = workInProgress2.type;
          prevState = workInProgress2.pendingProps;
          nextState = null !== current2 ? current2.memoizedProps : null;
          props = prevState.children;
          shouldSetTextContent($$typeof, prevState) ? props = null : null !== nextState && shouldSetTextContent($$typeof, nextState) && (workInProgress2.flags |= 32);
          null !== workInProgress2.memoizedState && ($$typeof = renderWithHooks(
            current2,
            workInProgress2,
            TransitionAwareHostComponent,
            null,
            null,
            renderLanes2
          ), HostTransitionContext._currentValue = $$typeof);
          markRef(current2, workInProgress2);
          reconcileChildren(current2, workInProgress2, props, renderLanes2);
          return workInProgress2.child;
        case 6:
          if (null === current2 && isHydrating) {
            if (current2 = renderLanes2 = nextHydratableInstance)
              renderLanes2 = canHydrateTextInstance(
                renderLanes2,
                workInProgress2.pendingProps,
                rootOrSingletonContext
              ), null !== renderLanes2 ? (workInProgress2.stateNode = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null, current2 = true) : current2 = false;
            current2 || throwOnHydrationMismatch(workInProgress2);
          }
          return null;
        case 13:
          return updateSuspenseComponent(current2, workInProgress2, renderLanes2);
        case 4:
          return pushHostContainer(
            workInProgress2,
            workInProgress2.stateNode.containerInfo
          ), props = workInProgress2.pendingProps, null === current2 ? workInProgress2.child = reconcileChildFibers(
            workInProgress2,
            null,
            props,
            renderLanes2
          ) : reconcileChildren(current2, workInProgress2, props, renderLanes2), workInProgress2.child;
        case 11:
          return updateForwardRef(
            current2,
            workInProgress2,
            workInProgress2.type,
            workInProgress2.pendingProps,
            renderLanes2
          );
        case 7:
          return props = workInProgress2.pendingProps, markRef(current2, workInProgress2), reconcileChildren(current2, workInProgress2, props, renderLanes2), workInProgress2.child;
        case 8:
          return reconcileChildren(
            current2,
            workInProgress2,
            workInProgress2.pendingProps.children,
            renderLanes2
          ), workInProgress2.child;
        case 12:
          return reconcileChildren(
            current2,
            workInProgress2,
            workInProgress2.pendingProps.children,
            renderLanes2
          ), workInProgress2.child;
        case 10:
          return updateContextProvider(current2, workInProgress2, renderLanes2);
        case 9:
          return $$typeof = workInProgress2.type._context, props = workInProgress2.pendingProps.children, prepareToReadContext(workInProgress2), $$typeof = readContext($$typeof), props = props($$typeof), workInProgress2.flags |= 1, reconcileChildren(current2, workInProgress2, props, renderLanes2), workInProgress2.child;
        case 14:
          return updateMemoComponent(
            current2,
            workInProgress2,
            workInProgress2.type,
            workInProgress2.pendingProps,
            renderLanes2
          );
        case 15:
          return updateSimpleMemoComponent(
            current2,
            workInProgress2,
            workInProgress2.type,
            workInProgress2.pendingProps,
            renderLanes2
          );
        case 19:
          return updateSuspenseListComponent(current2, workInProgress2, renderLanes2);
        case 31:
          return updateActivityComponent(current2, workInProgress2, renderLanes2);
        case 22:
          return updateOffscreenComponent(
            current2,
            workInProgress2,
            renderLanes2,
            workInProgress2.pendingProps
          );
        case 24:
          return prepareToReadContext(workInProgress2), props = readContext(CacheContext), null === current2 ? ($$typeof = peekCacheFromPool(), null === $$typeof && ($$typeof = workInProgressRoot, prevState = createCache(), $$typeof.pooledCache = prevState, prevState.refCount++, null !== prevState && ($$typeof.pooledCacheLanes |= renderLanes2), $$typeof = prevState), workInProgress2.memoizedState = { parent: props, cache: $$typeof }, initializeUpdateQueue(workInProgress2), pushProvider(workInProgress2, CacheContext, $$typeof)) : (0 !== (current2.lanes & renderLanes2) && (cloneUpdateQueue(current2, workInProgress2), processUpdateQueue(workInProgress2, null, null, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction()), $$typeof = current2.memoizedState, prevState = workInProgress2.memoizedState, $$typeof.parent !== props ? ($$typeof = { parent: props, cache: props }, workInProgress2.memoizedState = $$typeof, 0 === workInProgress2.lanes && (workInProgress2.memoizedState = workInProgress2.updateQueue.baseState = $$typeof), pushProvider(workInProgress2, CacheContext, props)) : (props = prevState.cache, pushProvider(workInProgress2, CacheContext, props), props !== $$typeof.cache && propagateContextChanges(
            workInProgress2,
            [CacheContext],
            renderLanes2,
            true
          ))), reconcileChildren(
            current2,
            workInProgress2,
            workInProgress2.pendingProps.children,
            renderLanes2
          ), workInProgress2.child;
        case 30:
          return null === workInProgress2.stateNode && (workInProgress2.stateNode = {
            autoName: null,
            paired: null,
            clones: null,
            ref: null
          }), props = workInProgress2.pendingProps, null != props.name && "auto" !== props.name ? workInProgress2.flags |= null === current2 ? 18882560 : 18874368 : isHydrating && pushMaterializedTreeId(workInProgress2), null !== current2 && current2.memoizedProps.name !== props.name ? workInProgress2.flags |= 4194816 : markRef(current2, workInProgress2), reconcileChildren(current2, workInProgress2, props.children, renderLanes2), workInProgress2.child;
        case 29:
          throw workInProgress2.pendingProps;
      }
      throw Error(formatProdErrorMessage(156, workInProgress2.tag));
    }
    function markUpdate(workInProgress2) {
      workInProgress2.flags |= 4;
    }
    function preloadInstanceAndSuspendIfNeeded(workInProgress2, type, oldProps, newProps, renderLanes2) {
      var JSCompiler_temp;
      if (JSCompiler_temp = 0 !== (workInProgress2.mode & 32))
        JSCompiler_temp = null === oldProps ? maySuspendCommit(type, newProps) : maySuspendCommit(type, newProps) && (newProps.src !== oldProps.src || newProps.srcSet !== oldProps.srcSet);
      if (JSCompiler_temp) {
        if (workInProgress2.flags |= 16777216, (renderLanes2 & 335544128) === renderLanes2)
          if (workInProgress2.stateNode.complete) workInProgress2.flags |= 8192;
          else if (shouldRemainOnPreviousScreen()) workInProgress2.flags |= 8192;
          else
            throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
      } else workInProgress2.flags &= -16777217;
    }
    function preloadResourceAndSuspendIfNeeded(workInProgress2, resource) {
      if ("stylesheet" !== resource.type || 0 !== (resource.state.loading & 4))
        workInProgress2.flags &= -16777217;
      else if (workInProgress2.flags |= 16777216, !preloadResource(resource))
        if (shouldRemainOnPreviousScreen()) workInProgress2.flags |= 8192;
        else
          throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
    }
    function scheduleRetryEffect(workInProgress2, retryQueue) {
      null !== retryQueue && (workInProgress2.flags |= 4);
      workInProgress2.flags & 16384 && (retryQueue = 22 !== workInProgress2.tag ? claimNextRetryLane() : 536870912, workInProgress2.lanes |= retryQueue, workInProgressSuspendedRetryLanes |= retryQueue);
    }
    function cutOffTailIfNeeded(renderState, hasRenderedATailFallback) {
      if (!isHydrating)
        switch (renderState.tailMode) {
          case "visible":
            break;
          case "collapsed":
            for (var tailNode = renderState.tail, lastTailNode = null; null !== tailNode; )
              null !== tailNode.alternate && (lastTailNode = tailNode), tailNode = tailNode.sibling;
            null === lastTailNode ? hasRenderedATailFallback || null === renderState.tail ? renderState.tail = null : renderState.tail.sibling = null : lastTailNode.sibling = null;
            break;
          default:
            hasRenderedATailFallback = renderState.tail;
            for (tailNode = null; null !== hasRenderedATailFallback; )
              null !== hasRenderedATailFallback.alternate && (tailNode = hasRenderedATailFallback), hasRenderedATailFallback = hasRenderedATailFallback.sibling;
            null === tailNode ? renderState.tail = null : tailNode.sibling = null;
        }
    }
    function bubbleProperties(completedWork) {
      var didBailout = null !== completedWork.alternate && completedWork.alternate.child === completedWork.child, newChildLanes = 0, subtreeFlags = 0;
      if (didBailout)
        for (var child$113 = completedWork.child; null !== child$113; )
          newChildLanes |= child$113.lanes | child$113.childLanes, subtreeFlags |= child$113.subtreeFlags & 1206910976, subtreeFlags |= child$113.flags & 1206910976, child$113.return = completedWork, child$113 = child$113.sibling;
      else
        for (child$113 = completedWork.child; null !== child$113; )
          newChildLanes |= child$113.lanes | child$113.childLanes, subtreeFlags |= child$113.subtreeFlags, subtreeFlags |= child$113.flags, child$113.return = completedWork, child$113 = child$113.sibling;
      completedWork.subtreeFlags |= subtreeFlags;
      completedWork.childLanes = newChildLanes;
      return didBailout;
    }
    function completeWork(current2, workInProgress2, renderLanes2) {
      var newProps = workInProgress2.pendingProps;
      popTreeContext(workInProgress2);
      switch (workInProgress2.tag) {
        case 16:
        case 15:
        case 0:
        case 11:
        case 7:
        case 8:
        case 12:
        case 9:
        case 14:
          return bubbleProperties(workInProgress2), null;
        case 1:
          return bubbleProperties(workInProgress2), null;
        case 3:
          renderLanes2 = workInProgress2.stateNode;
          newProps = null;
          null !== current2 && (newProps = current2.memoizedState.cache);
          workInProgress2.memoizedState.cache !== newProps && (workInProgress2.flags |= 2048);
          popProvider(CacheContext);
          popHostContainer();
          renderLanes2.pendingContext && (renderLanes2.context = renderLanes2.pendingContext, renderLanes2.pendingContext = null);
          if (null === current2 || null === current2.child)
            popHydrationState(workInProgress2) ? markUpdate(workInProgress2) : null === current2 || current2.memoizedState.isDehydrated && 0 === (workInProgress2.flags & 256) || (workInProgress2.flags |= 1024, upgradeHydrationErrorsToRecoverable());
          bubbleProperties(workInProgress2);
          return null;
        case 26:
          var type = workInProgress2.type, nextResource = workInProgress2.memoizedState;
          null === current2 ? (markUpdate(workInProgress2), null !== nextResource ? (bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(workInProgress2, nextResource)) : (bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(
            workInProgress2,
            type,
            null,
            newProps,
            renderLanes2
          ))) : nextResource ? nextResource !== current2.memoizedState ? (markUpdate(workInProgress2), bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(workInProgress2, nextResource)) : (bubbleProperties(workInProgress2), workInProgress2.flags &= -16777217) : (current2 = current2.memoizedProps, current2 !== newProps && markUpdate(workInProgress2), bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(
            workInProgress2,
            type,
            current2,
            newProps,
            renderLanes2
          ));
          return null;
        case 27:
          popHostContext(workInProgress2);
          renderLanes2 = rootInstanceStackCursor.current;
          type = workInProgress2.type;
          if (null !== current2 && null != workInProgress2.stateNode)
            current2.memoizedProps !== newProps && markUpdate(workInProgress2);
          else {
            if (!newProps) {
              if (null === workInProgress2.stateNode)
                throw Error(formatProdErrorMessage(166));
              bubbleProperties(workInProgress2);
              workInProgress2.subtreeFlags &= -33554433;
              return null;
            }
            current2 = contextStackCursor.current;
            popHydrationState(workInProgress2) ? prepareToHydrateHostInstance(workInProgress2, current2) : (current2 = resolveSingletonInstance(type, newProps, renderLanes2), workInProgress2.stateNode = current2, markUpdate(workInProgress2));
          }
          bubbleProperties(workInProgress2);
          workInProgress2.subtreeFlags &= -33554433;
          return null;
        case 5:
          popHostContext(workInProgress2);
          type = workInProgress2.type;
          if (null !== current2 && null != workInProgress2.stateNode)
            current2.memoizedProps !== newProps && markUpdate(workInProgress2);
          else {
            if (!newProps) {
              if (null === workInProgress2.stateNode)
                throw Error(formatProdErrorMessage(166));
              bubbleProperties(workInProgress2);
              workInProgress2.subtreeFlags &= -33554433;
              return null;
            }
            nextResource = contextStackCursor.current;
            if (popHydrationState(workInProgress2))
              prepareToHydrateHostInstance(workInProgress2, nextResource);
            else {
              var ownerDocument = getOwnerDocumentFromRootContainer(
                rootInstanceStackCursor.current
              );
              switch (nextResource) {
                case 1:
                  nextResource = ownerDocument.createElementNS(
                    "http://www.w3.org/2000/svg",
                    type
                  );
                  break;
                case 2:
                  nextResource = ownerDocument.createElementNS(
                    "http://www.w3.org/1998/Math/MathML",
                    type
                  );
                  break;
                default:
                  switch (type) {
                    case "svg":
                      nextResource = ownerDocument.createElementNS(
                        "http://www.w3.org/2000/svg",
                        type
                      );
                      break;
                    case "math":
                      nextResource = ownerDocument.createElementNS(
                        "http://www.w3.org/1998/Math/MathML",
                        type
                      );
                      break;
                    case "script":
                      nextResource = ownerDocument.createElement("div");
                      nextResource.innerHTML = "<script><\/script>";
                      nextResource = nextResource.removeChild(
                        nextResource.firstChild
                      );
                      break;
                    case "select":
                      nextResource = "string" === typeof newProps.is ? ownerDocument.createElement("select", {
                        is: newProps.is
                      }) : ownerDocument.createElement("select");
                      newProps.multiple ? nextResource.multiple = true : newProps.size && (nextResource.size = newProps.size);
                      break;
                    default:
                      nextResource = "string" === typeof newProps.is ? ownerDocument.createElement(type, { is: newProps.is }) : ownerDocument.createElement(type);
                  }
              }
              nextResource[internalInstanceKey] = workInProgress2;
              nextResource[internalPropsKey] = newProps;
              a: for (ownerDocument = workInProgress2.child; null !== ownerDocument; ) {
                if (5 === ownerDocument.tag || 6 === ownerDocument.tag)
                  nextResource.appendChild(ownerDocument.stateNode);
                else if (4 !== ownerDocument.tag && 27 !== ownerDocument.tag && null !== ownerDocument.child) {
                  ownerDocument.child.return = ownerDocument;
                  ownerDocument = ownerDocument.child;
                  continue;
                }
                if (ownerDocument === workInProgress2) break a;
                for (; null === ownerDocument.sibling; ) {
                  if (null === ownerDocument.return || ownerDocument.return === workInProgress2)
                    break a;
                  ownerDocument = ownerDocument.return;
                }
                ownerDocument.sibling.return = ownerDocument.return;
                ownerDocument = ownerDocument.sibling;
              }
              workInProgress2.stateNode = nextResource;
              a: switch (setInitialProperties(nextResource, type, newProps), type) {
                case "button":
                case "input":
                case "select":
                case "textarea":
                  newProps = !!newProps.autoFocus;
                  break a;
                case "img":
                  newProps = true;
                  break a;
                default:
                  newProps = false;
              }
              newProps && markUpdate(workInProgress2);
            }
          }
          bubbleProperties(workInProgress2);
          workInProgress2.subtreeFlags &= -33554433;
          preloadInstanceAndSuspendIfNeeded(
            workInProgress2,
            workInProgress2.type,
            null === current2 ? null : current2.memoizedProps,
            workInProgress2.pendingProps,
            renderLanes2
          );
          return null;
        case 6:
          if (current2 && null != workInProgress2.stateNode)
            current2.memoizedProps !== newProps && markUpdate(workInProgress2);
          else {
            if ("string" !== typeof newProps && null === workInProgress2.stateNode)
              throw Error(formatProdErrorMessage(166));
            current2 = rootInstanceStackCursor.current;
            if (popHydrationState(workInProgress2)) {
              current2 = workInProgress2.stateNode;
              renderLanes2 = workInProgress2.memoizedProps;
              newProps = null;
              type = hydrationParentFiber;
              if (null !== type)
                switch (type.tag) {
                  case 27:
                  case 5:
                    newProps = type.memoizedProps;
                }
              current2[internalInstanceKey] = workInProgress2;
              current2 = current2.nodeValue === renderLanes2 || null !== newProps && true === newProps.suppressHydrationWarning || checkForUnmatchedText(current2.nodeValue, renderLanes2) ? true : false;
              current2 || throwOnHydrationMismatch(workInProgress2, true);
            } else
              current2 = getOwnerDocumentFromRootContainer(current2).createTextNode(
                newProps
              ), current2[internalInstanceKey] = workInProgress2, workInProgress2.stateNode = current2;
          }
          bubbleProperties(workInProgress2);
          return null;
        case 31:
          renderLanes2 = workInProgress2.memoizedState;
          if (null === current2 || null !== current2.memoizedState) {
            newProps = popHydrationState(workInProgress2);
            if (null !== renderLanes2) {
              if (null === current2) {
                if (!newProps) throw Error(formatProdErrorMessage(318));
                current2 = workInProgress2.memoizedState;
                current2 = null !== current2 ? current2.dehydrated : null;
                if (!current2) throw Error(formatProdErrorMessage(557));
                current2[internalInstanceKey] = workInProgress2;
              } else
                resetHydrationState(), 0 === (workInProgress2.flags & 128) && (workInProgress2.memoizedState = null), workInProgress2.flags |= 4;
              bubbleProperties(workInProgress2);
              current2 = false;
            } else
              renderLanes2 = upgradeHydrationErrorsToRecoverable(), null !== current2 && null !== current2.memoizedState && (current2.memoizedState.hydrationErrors = renderLanes2), current2 = true;
            if (!current2) {
              if (workInProgress2.flags & 256)
                return popSuspenseHandler(workInProgress2), workInProgress2;
              popSuspenseHandler(workInProgress2);
              return null;
            }
            if (0 !== (workInProgress2.flags & 128))
              throw Error(formatProdErrorMessage(558));
          }
          bubbleProperties(workInProgress2);
          return null;
        case 13:
          newProps = workInProgress2.memoizedState;
          if (null === current2 || null !== current2.memoizedState && null !== current2.memoizedState.dehydrated) {
            type = popHydrationState(workInProgress2);
            if (null !== newProps && null !== newProps.dehydrated) {
              if (null === current2) {
                if (!type) throw Error(formatProdErrorMessage(318));
                type = workInProgress2.memoizedState;
                type = null !== type ? type.dehydrated : null;
                if (!type) throw Error(formatProdErrorMessage(317));
                type[internalInstanceKey] = workInProgress2;
              } else
                resetHydrationState(), 0 === (workInProgress2.flags & 128) && (workInProgress2.memoizedState = null), workInProgress2.flags |= 4;
              bubbleProperties(workInProgress2);
              type = false;
            } else
              type = upgradeHydrationErrorsToRecoverable(), null !== current2 && null !== current2.memoizedState && (current2.memoizedState.hydrationErrors = type), type = true;
            if (!type) {
              if (workInProgress2.flags & 256)
                return popSuspenseHandler(workInProgress2), workInProgress2;
              popSuspenseHandler(workInProgress2);
              return null;
            }
          }
          popSuspenseHandler(workInProgress2);
          if (0 !== (workInProgress2.flags & 128))
            return workInProgress2.lanes = renderLanes2, workInProgress2;
          renderLanes2 = null !== newProps;
          current2 = null !== current2 && null !== current2.memoizedState;
          renderLanes2 && (newProps = workInProgress2.child, type = null, null !== newProps.alternate && null !== newProps.alternate.memoizedState && null !== newProps.alternate.memoizedState.cachePool && (type = newProps.alternate.memoizedState.cachePool.pool), nextResource = null, null !== newProps.memoizedState && null !== newProps.memoizedState.cachePool && (nextResource = newProps.memoizedState.cachePool.pool), nextResource !== type && (newProps.flags |= 2048));
          renderLanes2 !== current2 && renderLanes2 && (workInProgress2.child.flags |= 8192);
          scheduleRetryEffect(workInProgress2, workInProgress2.updateQueue);
          bubbleProperties(workInProgress2);
          return null;
        case 4:
          return popHostContainer(), null === current2 && listenToAllSupportedEvents(workInProgress2.stateNode.containerInfo), workInProgress2.flags |= 67108864, bubbleProperties(workInProgress2), null;
        case 10:
          return popProvider(workInProgress2.type), bubbleProperties(workInProgress2), null;
        case 19:
          popSuspenseListContext(workInProgress2);
          newProps = workInProgress2.memoizedState;
          if (null === newProps) return bubbleProperties(workInProgress2), null;
          type = 0 !== (workInProgress2.flags & 128);
          nextResource = newProps.rendering;
          if (null === nextResource)
            if (type) cutOffTailIfNeeded(newProps, false);
            else {
              if (0 !== workInProgressRootExitStatus || null !== current2 && 0 !== (current2.flags & 128))
                for (current2 = workInProgress2.child; null !== current2; ) {
                  nextResource = findFirstSuspended(current2);
                  if (null !== nextResource) {
                    workInProgress2.flags |= 128;
                    cutOffTailIfNeeded(newProps, false);
                    current2 = nextResource.updateQueue;
                    workInProgress2.updateQueue = current2;
                    scheduleRetryEffect(workInProgress2, current2);
                    workInProgress2.subtreeFlags = 0;
                    current2 = renderLanes2;
                    for (renderLanes2 = workInProgress2.child; null !== renderLanes2; )
                      resetWorkInProgress(renderLanes2, current2), renderLanes2 = renderLanes2.sibling;
                    pushSuspenseListContext(
                      workInProgress2,
                      suspenseStackCursor.current & 1 | 2
                    );
                    isHydrating && pushTreeFork(workInProgress2, newProps.treeForkCount);
                    return workInProgress2.child;
                  }
                  current2 = current2.sibling;
                }
              null !== newProps.tail && now3() > workInProgressRootRenderTargetTime && (workInProgress2.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress2.lanes = 4194304);
            }
          else {
            if (!type)
              if (current2 = findFirstSuspended(nextResource), null !== current2) {
                if (workInProgress2.flags |= 128, type = true, current2 = current2.updateQueue, workInProgress2.updateQueue = current2, scheduleRetryEffect(workInProgress2, current2), cutOffTailIfNeeded(newProps, true), null === newProps.tail && "collapsed" !== newProps.tailMode && "visible" !== newProps.tailMode && !nextResource.alternate && !isHydrating)
                  return bubbleProperties(workInProgress2), null;
              } else
                2 * now3() - newProps.renderingStartTime > workInProgressRootRenderTargetTime && 536870912 !== renderLanes2 && (workInProgress2.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress2.lanes = 4194304);
            newProps.isBackwards ? (nextResource.sibling = workInProgress2.child, workInProgress2.child = nextResource) : (current2 = newProps.last, null !== current2 ? current2.sibling = nextResource : workInProgress2.child = nextResource, newProps.last = nextResource);
          }
          if (null !== newProps.tail) {
            current2 = newProps.tail;
            a: {
              for (renderLanes2 = current2; null !== renderLanes2; ) {
                if (null !== renderLanes2.alternate) {
                  renderLanes2 = false;
                  break a;
                }
                renderLanes2 = renderLanes2.sibling;
              }
              renderLanes2 = true;
            }
            newProps.rendering = current2;
            newProps.tail = current2.sibling;
            newProps.renderingStartTime = now3();
            current2.sibling = null;
            nextResource = suspenseStackCursor.current;
            nextResource = type ? nextResource & 1 | 2 : nextResource & 1;
            "visible" === newProps.tailMode || "collapsed" === newProps.tailMode || !renderLanes2 || isHydrating ? pushSuspenseListContext(workInProgress2, nextResource) : (renderLanes2 = nextResource, push(suspenseHandlerStackCursor, workInProgress2), push(suspenseStackCursor, renderLanes2), null === shellBoundary && (shellBoundary = workInProgress2));
            isHydrating && pushTreeFork(workInProgress2, newProps.treeForkCount);
            return current2;
          }
          bubbleProperties(workInProgress2);
          return null;
        case 22:
        case 23:
          return popSuspenseHandler(workInProgress2), popHiddenContext(), newProps = null !== workInProgress2.memoizedState, null !== current2 ? null !== current2.memoizedState !== newProps && (workInProgress2.flags |= 8192) : newProps && (workInProgress2.flags |= 8192), newProps ? 0 !== (renderLanes2 & 536870912) && 0 === (workInProgress2.flags & 128) && (bubbleProperties(workInProgress2), workInProgress2.subtreeFlags & 6 && (workInProgress2.flags |= 8192)) : bubbleProperties(workInProgress2), renderLanes2 = workInProgress2.updateQueue, null !== renderLanes2 && scheduleRetryEffect(workInProgress2, renderLanes2.retryQueue), renderLanes2 = null, null !== current2 && null !== current2.memoizedState && null !== current2.memoizedState.cachePool && (renderLanes2 = current2.memoizedState.cachePool.pool), newProps = null, null !== workInProgress2.memoizedState && null !== workInProgress2.memoizedState.cachePool && (newProps = workInProgress2.memoizedState.cachePool.pool), newProps !== renderLanes2 && (workInProgress2.flags |= 2048), null !== current2 && pop(resumedCache), null;
        case 24:
          return renderLanes2 = null, null !== current2 && (renderLanes2 = current2.memoizedState.cache), workInProgress2.memoizedState.cache !== renderLanes2 && (workInProgress2.flags |= 2048), popProvider(CacheContext), bubbleProperties(workInProgress2), null;
        case 25:
          return null;
        case 30:
          return workInProgress2.flags |= 33554432, bubbleProperties(workInProgress2), null;
      }
      throw Error(formatProdErrorMessage(156, workInProgress2.tag));
    }
    function unwindWork(current2, workInProgress2) {
      popTreeContext(workInProgress2);
      switch (workInProgress2.tag) {
        case 1:
          return current2 = workInProgress2.flags, current2 & 65536 ? (workInProgress2.flags = current2 & -65537 | 128, workInProgress2) : null;
        case 3:
          return popProvider(CacheContext), popHostContainer(), current2 = workInProgress2.flags, 0 !== (current2 & 65536) && 0 === (current2 & 128) ? (workInProgress2.flags = current2 & -65537 | 128, workInProgress2) : null;
        case 26:
        case 27:
        case 5:
          return popHostContext(workInProgress2), null;
        case 31:
          if (null !== workInProgress2.memoizedState) {
            popSuspenseHandler(workInProgress2);
            if (null === workInProgress2.alternate)
              throw Error(formatProdErrorMessage(340));
            resetHydrationState();
          }
          current2 = workInProgress2.flags;
          return current2 & 65536 ? (workInProgress2.flags = current2 & -65537 | 128, workInProgress2) : null;
        case 13:
          popSuspenseHandler(workInProgress2);
          current2 = workInProgress2.memoizedState;
          if (null !== current2 && null !== current2.dehydrated) {
            if (null === workInProgress2.alternate)
              throw Error(formatProdErrorMessage(340));
            resetHydrationState();
          }
          current2 = workInProgress2.flags;
          return current2 & 65536 ? (workInProgress2.flags = current2 & -65537 | 128, workInProgress2) : null;
        case 19:
          return popSuspenseListContext(workInProgress2), current2 = workInProgress2.flags, current2 & 65536 ? (workInProgress2.flags = current2 & -65537 | 128, current2 = workInProgress2.memoizedState, null !== current2 && (current2.rendering = null, current2.tail = null), workInProgress2.flags |= 4, workInProgress2) : null;
        case 4:
          return popHostContainer(), null;
        case 10:
          return popProvider(workInProgress2.type), null;
        case 22:
        case 23:
          return popSuspenseHandler(workInProgress2), popHiddenContext(), null !== current2 && pop(resumedCache), current2 = workInProgress2.flags, current2 & 65536 ? (workInProgress2.flags = current2 & -65537 | 128, workInProgress2) : null;
        case 24:
          return popProvider(CacheContext), null;
        case 25:
          return null;
        default:
          return null;
      }
    }
    function unwindInterruptedWork(current2, interruptedWork) {
      popTreeContext(interruptedWork);
      switch (interruptedWork.tag) {
        case 3:
          popProvider(CacheContext);
          popHostContainer();
          break;
        case 26:
        case 27:
        case 5:
          popHostContext(interruptedWork);
          break;
        case 4:
          popHostContainer();
          break;
        case 31:
          null !== interruptedWork.memoizedState && popSuspenseHandler(interruptedWork);
          break;
        case 13:
          popSuspenseHandler(interruptedWork);
          break;
        case 19:
          popSuspenseListContext(interruptedWork);
          break;
        case 10:
          popProvider(interruptedWork.type);
          break;
        case 22:
        case 23:
          popSuspenseHandler(interruptedWork);
          popHiddenContext();
          null !== current2 && pop(resumedCache);
          break;
        case 24:
          popProvider(CacheContext);
      }
    }
    function commitHookEffectListMount(flags, finishedWork) {
      try {
        var updateQueue = finishedWork.updateQueue, lastEffect = null !== updateQueue ? updateQueue.lastEffect : null;
        if (null !== lastEffect) {
          var firstEffect = lastEffect.next;
          updateQueue = firstEffect;
          do {
            if ((updateQueue.tag & flags) === flags) {
              lastEffect = void 0;
              var create = updateQueue.create, inst = updateQueue.inst;
              lastEffect = create();
              inst.destroy = lastEffect;
            }
            updateQueue = updateQueue.next;
          } while (updateQueue !== firstEffect);
        }
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitHookEffectListUnmount(flags, finishedWork, nearestMountedAncestor$jscomp$0) {
      try {
        var updateQueue = finishedWork.updateQueue, lastEffect = null !== updateQueue ? updateQueue.lastEffect : null;
        if (null !== lastEffect) {
          var firstEffect = lastEffect.next;
          updateQueue = firstEffect;
          do {
            if ((updateQueue.tag & flags) === flags) {
              var inst = updateQueue.inst, destroy = inst.destroy;
              if (void 0 !== destroy) {
                inst.destroy = void 0;
                lastEffect = finishedWork;
                var nearestMountedAncestor = nearestMountedAncestor$jscomp$0, destroy_ = destroy;
                try {
                  destroy_();
                } catch (error) {
                  captureCommitPhaseError(
                    lastEffect,
                    nearestMountedAncestor,
                    error
                  );
                }
              }
            }
            updateQueue = updateQueue.next;
          } while (updateQueue !== firstEffect);
        }
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitClassCallbacks(finishedWork) {
      var updateQueue = finishedWork.updateQueue;
      if (null !== updateQueue) {
        var instance = finishedWork.stateNode;
        try {
          commitCallbacks(updateQueue, instance);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
    }
    function safelyCallComponentWillUnmount(current2, nearestMountedAncestor, instance) {
      instance.props = resolveClassComponentProps(
        current2.type,
        current2.memoizedProps
      );
      instance.state = current2.memoizedState;
      try {
        instance.componentWillUnmount();
      } catch (error) {
        captureCommitPhaseError(current2, nearestMountedAncestor, error);
      }
    }
    function safelyAttachRef(current2, nearestMountedAncestor) {
      try {
        var ref = current2.ref;
        if (null !== ref) {
          switch (current2.tag) {
            case 26:
            case 27:
            case 5:
              var instanceToUse = current2.stateNode;
              break;
            case 30:
              var instance = current2.stateNode, name = getViewTransitionName(current2.memoizedProps, instance);
              if (null === instance.ref || instance.ref.name !== name)
                instance.ref = createViewTransitionInstance(name);
              instanceToUse = instance.ref;
              break;
            case 7:
              if (null === current2.stateNode) {
                var fragmentInstance = new FragmentInstance(current2);
                traverseVisibleInstancesAndTextInstances(
                  current2.child,
                  false,
                  addFragmentHandleToFiber,
                  fragmentInstance,
                  void 0,
                  void 0
                );
                current2.stateNode = fragmentInstance;
              }
              instanceToUse = current2.stateNode;
              break;
            default:
              instanceToUse = current2.stateNode;
          }
          "function" === typeof ref ? current2.refCleanup = ref(instanceToUse) : ref.current = instanceToUse;
        }
      } catch (error) {
        captureCommitPhaseError(current2, nearestMountedAncestor, error);
      }
    }
    function safelyDetachRef(current2, nearestMountedAncestor) {
      var ref = current2.ref, refCleanup = current2.refCleanup;
      if (null !== ref)
        if ("function" === typeof refCleanup)
          try {
            refCleanup();
          } catch (error) {
            captureCommitPhaseError(current2, nearestMountedAncestor, error);
          } finally {
            current2.refCleanup = null, current2 = current2.alternate, null != current2 && (current2.refCleanup = null);
          }
        else if ("function" === typeof ref)
          try {
            ref(null);
          } catch (error$148) {
            captureCommitPhaseError(current2, nearestMountedAncestor, error$148);
          }
        else ref.current = null;
    }
    function commitNewChildToFragmentInstances(fiber, parentFragmentInstances) {
      if ((5 === fiber.tag || 27 === fiber.tag || 6 === fiber.tag) && null === fiber.alternate && null !== parentFragmentInstances)
        for (var i = 0; i < parentFragmentInstances.length; i++)
          commitNewChildToFragmentInstance(
            fiber.stateNode,
            parentFragmentInstances[i]
          );
    }
    function commitFragmentInstanceInsertionEffects(fiber) {
      for (var parent = fiber.return; null !== parent; ) {
        isFragmentInstanceParent(parent) && commitNewChildToFragmentInstance(fiber.stateNode, parent.stateNode);
        if (isFragmentInstanceHostBoundary(parent)) break;
        parent = parent.return;
      }
    }
    function commitFragmentInstanceDeletionEffects(fiber) {
      for (var parent = fiber.return; null !== parent; ) {
        isFragmentInstanceParent(parent) && deleteChildFromFragmentInstance(fiber.stateNode, parent.stateNode);
        if (isFragmentInstanceHostBoundary(parent)) break;
        parent = parent.return;
      }
    }
    function isFragmentInstanceHostBoundary(fiber) {
      return 5 === fiber.tag || 3 === fiber.tag || 27 === fiber.tag;
    }
    function isFragmentInstanceParent(fiber) {
      return fiber && 7 === fiber.tag && null !== fiber.stateNode;
    }
    function commitHostMount(finishedWork) {
      var type = finishedWork.type, props = finishedWork.memoizedProps, instance = finishedWork.stateNode;
      try {
        a: switch (type) {
          case "button":
          case "input":
          case "select":
          case "textarea":
            props.autoFocus && instance.focus();
            break a;
          case "img":
            props.src ? instance.src = props.src : props.srcSet && (instance.srcset = props.srcSet);
        }
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitHostUpdate(finishedWork, newProps, oldProps) {
      try {
        var domElement = finishedWork.stateNode;
        updateProperties(domElement, finishedWork.type, oldProps, newProps);
        domElement[internalPropsKey] = newProps;
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function isHostParent(fiber) {
      return 5 === fiber.tag || 3 === fiber.tag || 26 === fiber.tag || 27 === fiber.tag && isSingletonScope(fiber.type) || 4 === fiber.tag;
    }
    function getHostSibling(fiber) {
      a: for (; ; ) {
        for (; null === fiber.sibling; ) {
          if (null === fiber.return || isHostParent(fiber.return)) return null;
          fiber = fiber.return;
        }
        fiber.sibling.return = fiber.return;
        for (fiber = fiber.sibling; 5 !== fiber.tag && 6 !== fiber.tag && 18 !== fiber.tag; ) {
          if (27 === fiber.tag && isSingletonScope(fiber.type)) continue a;
          if (fiber.flags & 2) continue a;
          if (null === fiber.child || 4 === fiber.tag) continue a;
          else fiber.child.return = fiber, fiber = fiber.child;
        }
        if (!(fiber.flags & 2)) return fiber.stateNode;
      }
    }
    function insertOrAppendPlacementNodeIntoContainer(node, before, parent, parentFragmentInstances) {
      var tag = node.tag;
      if (5 === tag || 6 === tag)
        tag = node.stateNode, before ? (9 === parent.nodeType ? parent.body : "HTML" === parent.nodeName ? parent.ownerDocument.body : parent).insertBefore(tag, before) : (before = 9 === parent.nodeType ? parent.body : "HTML" === parent.nodeName ? parent.ownerDocument.body : parent, before.appendChild(tag), parent = parent._reactRootContainer, null !== parent && void 0 !== parent || null !== before.onclick || (before.onclick = noop$1)), commitNewChildToFragmentInstances(node, parentFragmentInstances), viewTransitionMutationContext = true;
      else if (4 !== tag && (27 === tag && (commitNewChildToFragmentInstances(node, parentFragmentInstances), parentFragmentInstances = null, isSingletonScope(node.type) && (parent = node.stateNode, before = null)), node = node.child, null !== node))
        for (insertOrAppendPlacementNodeIntoContainer(
          node,
          before,
          parent,
          parentFragmentInstances
        ), node = node.sibling; null !== node; )
          insertOrAppendPlacementNodeIntoContainer(
            node,
            before,
            parent,
            parentFragmentInstances
          ), node = node.sibling;
    }
    function insertOrAppendPlacementNode(node, before, parent, parentFragmentInstances) {
      var tag = node.tag;
      if (5 === tag || 6 === tag)
        tag = node.stateNode, before ? parent.insertBefore(tag, before) : parent.appendChild(tag), commitNewChildToFragmentInstances(node, parentFragmentInstances), viewTransitionMutationContext = true;
      else if (4 !== tag && (27 === tag && (commitNewChildToFragmentInstances(node, parentFragmentInstances), parentFragmentInstances = null, isSingletonScope(node.type) && (parent = node.stateNode)), node = node.child, null !== node))
        for (insertOrAppendPlacementNode(
          node,
          before,
          parent,
          parentFragmentInstances
        ), node = node.sibling; null !== node; )
          insertOrAppendPlacementNode(
            node,
            before,
            parent,
            parentFragmentInstances
          ), node = node.sibling;
    }
    function commitHostSingletonAcquisition(finishedWork) {
      var singleton = finishedWork.stateNode, props = finishedWork.memoizedProps;
      try {
        for (var type = finishedWork.type, attributes = singleton.attributes; attributes.length; )
          singleton.removeAttributeNode(attributes[0]);
        setInitialProperties(singleton, type, props);
        singleton[internalInstanceKey] = finishedWork;
        singleton[internalPropsKey] = props;
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    var shouldStartViewTransition = false;
    var appearingViewTransitions = null;
    function trackEnterViewTransitions(placement) {
      if (30 === placement.tag || 0 !== (placement.subtreeFlags & 33554432))
        shouldStartViewTransition = true;
    }
    var viewTransitionCancelableChildren = null;
    function pushViewTransitionCancelableScope() {
      var prevChildren = viewTransitionCancelableChildren;
      viewTransitionCancelableChildren = null;
      return prevChildren;
    }
    var viewTransitionHostInstanceIdx = 0;
    function applyViewTransitionToHostInstances(fiber, name, className, collectMeasurements, stopAtNestedViewTransitions) {
      viewTransitionHostInstanceIdx = 0;
      return applyViewTransitionToHostInstancesRecursive(
        fiber.child,
        name,
        className,
        collectMeasurements,
        stopAtNestedViewTransitions
      );
    }
    function applyViewTransitionToHostInstancesRecursive(child, name, className, collectMeasurements, stopAtNestedViewTransitions) {
      for (var inViewport = false; null !== child; ) {
        if (5 === child.tag) {
          var instance = child.stateNode;
          if (null !== collectMeasurements) {
            var measurement = measureInstance(instance);
            collectMeasurements.push(measurement);
            measurement.view && (inViewport = true);
          } else
            inViewport || measureInstance(instance).view && (inViewport = true);
          shouldStartViewTransition = true;
          applyViewTransitionName(
            instance,
            0 === viewTransitionHostInstanceIdx ? name : name + "_" + viewTransitionHostInstanceIdx,
            className
          );
          viewTransitionHostInstanceIdx++;
        } else if (22 !== child.tag || null === child.memoizedState)
          30 === child.tag && stopAtNestedViewTransitions || applyViewTransitionToHostInstancesRecursive(
            child.child,
            name,
            className,
            collectMeasurements,
            stopAtNestedViewTransitions
          ) && (inViewport = true);
        child = child.sibling;
      }
      return inViewport;
    }
    function restoreViewTransitionOnHostInstances(child, stopAtNestedViewTransitions) {
      for (; null !== child; ) {
        if (5 === child.tag)
          restoreViewTransitionName(child.stateNode, child.memoizedProps);
        else if (22 !== child.tag || null === child.memoizedState)
          30 === child.tag && stopAtNestedViewTransitions || restoreViewTransitionOnHostInstances(
            child.child,
            stopAtNestedViewTransitions
          );
        child = child.sibling;
      }
    }
    function commitAppearingPairViewTransitions(placement) {
      if (0 !== (placement.subtreeFlags & 18874368))
        for (placement = placement.child; null !== placement; ) {
          if (22 !== placement.tag || null === placement.memoizedState) {
            if (commitAppearingPairViewTransitions(placement), 30 === placement.tag && 0 !== (placement.flags & 18874368) && placement.stateNode.paired) {
              var props = placement.memoizedProps;
              if (null == props.name || "auto" === props.name)
                throw Error(formatProdErrorMessage(544));
              var name = props.name;
              props = getViewTransitionClassName(props.default, props.share);
              "none" !== props && (applyViewTransitionToHostInstances(
                placement,
                name,
                props,
                null,
                false
              ) || restoreViewTransitionOnHostInstances(placement.child, false));
            }
          }
          placement = placement.sibling;
        }
    }
    function commitEnterViewTransitions(placement, gesture) {
      if (30 === placement.tag) {
        var state = placement.stateNode, props = placement.memoizedProps, name = getViewTransitionName(props, state), className = getViewTransitionClassName(
          props.default,
          state.paired ? props.share : props.enter
        );
        "none" !== className ? applyViewTransitionToHostInstances(placement, name, className, null, false) ? (commitAppearingPairViewTransitions(placement), state.paired || gesture || scheduleViewTransitionEvent(placement, props.onEnter)) : restoreViewTransitionOnHostInstances(placement.child, false) : commitAppearingPairViewTransitions(placement);
      } else if (0 !== (placement.subtreeFlags & 33554432))
        for (placement = placement.child; null !== placement; )
          commitEnterViewTransitions(placement, gesture), placement = placement.sibling;
      else commitAppearingPairViewTransitions(placement);
    }
    function commitDeletedPairViewTransitions(deletion) {
      if (null !== appearingViewTransitions && 0 !== appearingViewTransitions.size) {
        var pairs = appearingViewTransitions;
        if (0 !== (deletion.subtreeFlags & 18874368))
          for (deletion = deletion.child; null !== deletion; ) {
            if (22 !== deletion.tag || null === deletion.memoizedState) {
              if (30 === deletion.tag && 0 !== (deletion.flags & 18874368)) {
                var props = deletion.memoizedProps, name = props.name;
                if (null != name && "auto" !== name) {
                  var pair = pairs.get(name);
                  if (void 0 !== pair) {
                    var className = getViewTransitionClassName(
                      props.default,
                      props.share
                    );
                    "none" !== className && (applyViewTransitionToHostInstances(
                      deletion,
                      name,
                      className,
                      null,
                      false
                    ) ? (className = deletion.stateNode, pair.paired = className, className.paired = pair, scheduleViewTransitionEvent(deletion, props.onShare)) : restoreViewTransitionOnHostInstances(deletion.child, false));
                    pairs.delete(name);
                    if (0 === pairs.size) break;
                  }
                }
              }
              commitDeletedPairViewTransitions(deletion);
            }
            deletion = deletion.sibling;
          }
      }
    }
    function commitExitViewTransitions(deletion) {
      if (30 === deletion.tag) {
        var props = deletion.memoizedProps, name = getViewTransitionName(props, deletion.stateNode), pair = null !== appearingViewTransitions ? appearingViewTransitions.get(name) : void 0, className = getViewTransitionClassName(
          props.default,
          void 0 !== pair ? props.share : props.exit
        );
        "none" !== className && (applyViewTransitionToHostInstances(deletion, name, className, null, false) ? void 0 !== pair ? (className = deletion.stateNode, pair.paired = className, className.paired = pair, appearingViewTransitions.delete(name), scheduleViewTransitionEvent(deletion, props.onShare)) : scheduleViewTransitionEvent(deletion, props.onExit) : restoreViewTransitionOnHostInstances(deletion.child, false));
        null !== appearingViewTransitions && commitDeletedPairViewTransitions(deletion);
      } else if (0 !== (deletion.subtreeFlags & 33554432))
        for (deletion = deletion.child; null !== deletion; )
          commitExitViewTransitions(deletion), deletion = deletion.sibling;
      else
        null !== appearingViewTransitions && commitDeletedPairViewTransitions(deletion);
    }
    function commitNestedViewTransitions(changedParent) {
      for (changedParent = changedParent.child; null !== changedParent; ) {
        if (30 === changedParent.tag) {
          var props = changedParent.memoizedProps, name = getViewTransitionName(props, changedParent.stateNode);
          props = getViewTransitionClassName(props.default, props.update);
          changedParent.flags &= -5;
          "none" !== props && applyViewTransitionToHostInstances(
            changedParent,
            name,
            props,
            changedParent.memoizedState = [],
            false
          );
        } else
          0 !== (changedParent.subtreeFlags & 33554432) && commitNestedViewTransitions(changedParent);
        changedParent = changedParent.sibling;
      }
    }
    function restorePairedViewTransitions(parent) {
      if (0 !== (parent.subtreeFlags & 18874368))
        for (parent = parent.child; null !== parent; ) {
          if (22 !== parent.tag || null === parent.memoizedState) {
            if (30 === parent.tag && 0 !== (parent.flags & 18874368)) {
              var instance = parent.stateNode;
              null !== instance.paired && (instance.paired = null, restoreViewTransitionOnHostInstances(parent.child, false));
            }
            restorePairedViewTransitions(parent);
          }
          parent = parent.sibling;
        }
    }
    function restoreEnterOrExitViewTransitions(fiber) {
      if (30 === fiber.tag)
        fiber.stateNode.paired = null, restoreViewTransitionOnHostInstances(fiber.child, false), restorePairedViewTransitions(fiber);
      else if (0 !== (fiber.subtreeFlags & 33554432))
        for (fiber = fiber.child; null !== fiber; )
          restoreEnterOrExitViewTransitions(fiber), fiber = fiber.sibling;
      else restorePairedViewTransitions(fiber);
    }
    function restoreNestedViewTransitions(changedParent) {
      for (changedParent = changedParent.child; null !== changedParent; )
        30 === changedParent.tag ? restoreViewTransitionOnHostInstances(changedParent.child, false) : 0 !== (changedParent.subtreeFlags & 33554432) && restoreNestedViewTransitions(changedParent), changedParent = changedParent.sibling;
    }
    function measureViewTransitionHostInstancesRecursive(parentViewTransition, child, newName, oldName, className, previousMeasurements, stopAtNestedViewTransitions) {
      for (var inViewport = false; null !== child; ) {
        if (5 === child.tag) {
          var instance = child.stateNode;
          if (null !== previousMeasurements && viewTransitionHostInstanceIdx < previousMeasurements.length) {
            var previousMeasurement = previousMeasurements[viewTransitionHostInstanceIdx], nextMeasurement = measureInstance(instance);
            if (previousMeasurement.view || nextMeasurement.view) inViewport = true;
            var JSCompiler_temp;
            if (JSCompiler_temp = 0 === (parentViewTransition.flags & 4))
              if (nextMeasurement.clip) JSCompiler_temp = true;
              else {
                JSCompiler_temp = previousMeasurement.rect;
                var newRect = nextMeasurement.rect;
                JSCompiler_temp = JSCompiler_temp.y !== newRect.y || JSCompiler_temp.x !== newRect.x || JSCompiler_temp.height !== newRect.height || JSCompiler_temp.width !== newRect.width;
              }
            JSCompiler_temp && (parentViewTransition.flags |= 4);
            nextMeasurement.abs ? nextMeasurement = !previousMeasurement.abs : (previousMeasurement = previousMeasurement.rect, nextMeasurement = nextMeasurement.rect, nextMeasurement = previousMeasurement.height !== nextMeasurement.height || previousMeasurement.width !== nextMeasurement.width);
            nextMeasurement && (parentViewTransition.flags |= 32);
          } else parentViewTransition.flags |= 32;
          0 !== (parentViewTransition.flags & 4) && applyViewTransitionName(
            instance,
            0 === viewTransitionHostInstanceIdx ? newName : newName + "_" + viewTransitionHostInstanceIdx,
            className
          );
          inViewport && 0 !== (parentViewTransition.flags & 4) || (null === viewTransitionCancelableChildren && (viewTransitionCancelableChildren = []), viewTransitionCancelableChildren.push(
            instance,
            0 === viewTransitionHostInstanceIdx ? oldName : oldName + "_" + viewTransitionHostInstanceIdx,
            child.memoizedProps
          ));
          viewTransitionHostInstanceIdx++;
        } else if (22 !== child.tag || null === child.memoizedState)
          30 === child.tag && stopAtNestedViewTransitions ? parentViewTransition.flags |= child.flags & 32 : measureViewTransitionHostInstancesRecursive(
            parentViewTransition,
            child.child,
            newName,
            oldName,
            className,
            previousMeasurements,
            stopAtNestedViewTransitions
          ) && (inViewport = true);
        child = child.sibling;
      }
      return inViewport;
    }
    function measureNestedViewTransitions(changedParent, gesture) {
      for (changedParent = changedParent.child; null !== changedParent; ) {
        if (30 === changedParent.tag) {
          var props = changedParent.memoizedProps, state = changedParent.stateNode, name = getViewTransitionName(props, state), className = getViewTransitionClassName(props.default, props.update);
          if (gesture) {
            state = state.clones;
            var previousMeasurements = null === state ? null : state.map(measureClonedInstance);
          } else
            previousMeasurements = changedParent.memoizedState, changedParent.memoizedState = null;
          state = changedParent;
          var child = changedParent.child;
          viewTransitionHostInstanceIdx = 0;
          name = measureViewTransitionHostInstancesRecursive(
            state,
            child,
            name,
            name,
            className,
            previousMeasurements,
            false
          );
          0 !== (changedParent.flags & 4) && name && (gesture || scheduleViewTransitionEvent(changedParent, props.onUpdate));
        } else
          0 !== (changedParent.subtreeFlags & 33554432) && measureNestedViewTransitions(changedParent, gesture);
        changedParent = changedParent.sibling;
      }
    }
    var offscreenSubtreeIsHidden = false;
    var offscreenSubtreeWasHidden = false;
    var offscreenDirectParentIsHidden = false;
    var needsFormReset = false;
    var PossiblyWeakSet = "function" === typeof WeakSet ? WeakSet : Set;
    var nextEffect = null;
    var viewTransitionContextChanged = false;
    var inUpdateViewTransition = false;
    var rootViewTransitionAffected = false;
    var rootViewTransitionNameCanceled = false;
    function commitBeforeMutationEffects(root2, firstChild, committedLanes) {
      root2 = root2.containerInfo;
      eventsEnabled = _enabled;
      root2 = getActiveElementDeep(root2);
      if (hasSelectionCapabilities(root2)) {
        if ("selectionStart" in root2)
          var JSCompiler_temp = {
            start: root2.selectionStart,
            end: root2.selectionEnd
          };
        else
          a: {
            JSCompiler_temp = (JSCompiler_temp = root2.ownerDocument) && JSCompiler_temp.defaultView || window;
            var selection = JSCompiler_temp.getSelection && JSCompiler_temp.getSelection();
            if (selection && 0 !== selection.rangeCount) {
              JSCompiler_temp = selection.anchorNode;
              var anchorOffset = selection.anchorOffset, focusNode = selection.focusNode;
              selection = selection.focusOffset;
              try {
                JSCompiler_temp.nodeType, focusNode.nodeType;
              } catch (e$21) {
                JSCompiler_temp = null;
                break a;
              }
              var length = 0, start = -1, end = -1, indexWithinAnchor = 0, indexWithinFocus = 0, node = root2, parentNode = null;
              b: for (; ; ) {
                for (var next; ; ) {
                  node !== JSCompiler_temp || 0 !== anchorOffset && 3 !== node.nodeType || (start = length + anchorOffset);
                  node !== focusNode || 0 !== selection && 3 !== node.nodeType || (end = length + selection);
                  3 === node.nodeType && (length += node.nodeValue.length);
                  if (null === (next = node.firstChild)) break;
                  parentNode = node;
                  node = next;
                }
                for (; ; ) {
                  if (node === root2) break b;
                  parentNode === JSCompiler_temp && ++indexWithinAnchor === anchorOffset && (start = length);
                  parentNode === focusNode && ++indexWithinFocus === selection && (end = length);
                  if (null !== (next = node.nextSibling)) break;
                  node = parentNode;
                  parentNode = node.parentNode;
                }
                node = next;
              }
              JSCompiler_temp = -1 === start || -1 === end ? null : { start, end };
            } else JSCompiler_temp = null;
          }
        JSCompiler_temp = JSCompiler_temp || { start: 0, end: 0 };
      } else JSCompiler_temp = null;
      selectionInformation = { focusedElem: root2, selectionRange: JSCompiler_temp };
      _enabled = false;
      committedLanes = (committedLanes & 335544064) === committedLanes;
      nextEffect = firstChild;
      for (firstChild = committedLanes ? 9270 : 1024; null !== nextEffect; ) {
        root2 = nextEffect;
        if (committedLanes && (JSCompiler_temp = root2.deletions, null !== JSCompiler_temp))
          for (anchorOffset = 0; anchorOffset < JSCompiler_temp.length; anchorOffset++)
            committedLanes && commitExitViewTransitions(JSCompiler_temp[anchorOffset]);
        if (null === root2.alternate && 0 !== (root2.flags & 2))
          committedLanes && trackEnterViewTransitions(root2), commitBeforeMutationEffects_complete(committedLanes);
        else {
          if (22 === root2.tag) {
            if (JSCompiler_temp = root2.alternate, null !== root2.memoizedState) {
              null !== JSCompiler_temp && null === JSCompiler_temp.memoizedState && committedLanes && commitExitViewTransitions(JSCompiler_temp);
              commitBeforeMutationEffects_complete(committedLanes);
              continue;
            } else if (null !== JSCompiler_temp && null !== JSCompiler_temp.memoizedState) {
              committedLanes && trackEnterViewTransitions(root2);
              commitBeforeMutationEffects_complete(committedLanes);
              continue;
            }
          }
          JSCompiler_temp = root2.child;
          0 !== (root2.subtreeFlags & firstChild) && null !== JSCompiler_temp ? (JSCompiler_temp.return = root2, nextEffect = JSCompiler_temp) : (committedLanes && commitNestedViewTransitions(root2), commitBeforeMutationEffects_complete(committedLanes));
        }
      }
      appearingViewTransitions = null;
    }
    function commitBeforeMutationEffects_complete(isViewTransitionEligible$jscomp$0) {
      for (; null !== nextEffect; ) {
        var fiber = nextEffect, isViewTransitionEligible = isViewTransitionEligible$jscomp$0, current2 = fiber.alternate, flags = fiber.flags;
        switch (fiber.tag) {
          case 0:
          case 11:
          case 15:
            break;
          case 1:
            if (0 !== (flags & 1024) && null !== current2) {
              isViewTransitionEligible = void 0;
              flags = current2.memoizedProps;
              current2 = current2.memoizedState;
              var instance = fiber.stateNode;
              try {
                var resolvedPrevProps = resolveClassComponentProps(
                  fiber.type,
                  flags
                );
                isViewTransitionEligible = instance.getSnapshotBeforeUpdate(
                  resolvedPrevProps,
                  current2
                );
                instance.__reactInternalSnapshotBeforeUpdate = isViewTransitionEligible;
              } catch (error) {
                captureCommitPhaseError(fiber, fiber.return, error);
              }
            }
            break;
          case 3:
            if (0 !== (flags & 1024)) {
              if (current2 = fiber.stateNode.containerInfo, isViewTransitionEligible = current2.nodeType, 9 === isViewTransitionEligible)
                clearContainerSparingly(current2);
              else if (1 === isViewTransitionEligible)
                switch (current2.nodeName) {
                  case "HEAD":
                  case "HTML":
                  case "BODY":
                    clearContainerSparingly(current2);
                    break;
                  default:
                    current2.textContent = "";
                }
            }
            break;
          case 5:
          case 26:
          case 27:
          case 6:
          case 4:
          case 17:
            break;
          case 30:
            isViewTransitionEligible && null !== current2 && (isViewTransitionEligible = getViewTransitionName(
              current2.memoizedProps,
              current2.stateNode
            ), flags = fiber.memoizedProps, flags = getViewTransitionClassName(flags.default, flags.update), "none" !== flags && applyViewTransitionToHostInstances(
              current2,
              isViewTransitionEligible,
              flags,
              current2.memoizedState = [],
              true
            ));
            break;
          default:
            if (0 !== (flags & 1024)) throw Error(formatProdErrorMessage(163));
        }
        current2 = fiber.sibling;
        if (null !== current2) {
          current2.return = fiber.return;
          nextEffect = current2;
          break;
        }
        nextEffect = fiber.return;
      }
    }
    function commitLayoutEffectOnFiber(finishedRoot, current2, finishedWork) {
      var flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitHookEffectListMount(5, finishedWork);
          break;
        case 1:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          if (flags & 4)
            if (finishedRoot = finishedWork.stateNode, null === current2)
              try {
                finishedRoot.componentDidMount();
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            else {
              var prevProps = resolveClassComponentProps(
                finishedWork.type,
                current2.memoizedProps
              );
              current2 = current2.memoizedState;
              try {
                finishedRoot.componentDidUpdate(
                  prevProps,
                  current2,
                  finishedRoot.__reactInternalSnapshotBeforeUpdate
                );
              } catch (error$146) {
                captureCommitPhaseError(
                  finishedWork,
                  finishedWork.return,
                  error$146
                );
              }
            }
          flags & 64 && commitClassCallbacks(finishedWork);
          flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
          break;
        case 3:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          if (flags & 64 && (finishedRoot = finishedWork.updateQueue, null !== finishedRoot)) {
            current2 = null;
            if (null !== finishedWork.child)
              switch (finishedWork.child.tag) {
                case 27:
                case 5:
                  current2 = finishedWork.child.stateNode;
                  break;
                case 1:
                  current2 = finishedWork.child.stateNode;
              }
            try {
              commitCallbacks(finishedRoot, current2);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
          break;
        case 27:
          null === current2 && flags & 4 && commitHostSingletonAcquisition(finishedWork);
        case 26:
        case 5:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          null === current2 && flags & 4 && commitHostMount(finishedWork);
          flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
          break;
        case 12:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          break;
        case 31:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitActivityHydrationCallbacks(finishedRoot, finishedWork);
          break;
        case 13:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
          flags & 64 && (finishedRoot = finishedWork.memoizedState, null !== finishedRoot && (finishedRoot = finishedRoot.dehydrated, null !== finishedRoot && (finishedWork = retryDehydratedSuspenseBoundary.bind(
            null,
            finishedWork
          ), registerSuspenseInstanceRetry(finishedRoot, finishedWork))));
          break;
        case 22:
          flags = null !== finishedWork.memoizedState || offscreenSubtreeIsHidden;
          if (!flags) {
            var newOffscreenSubtreeWasHidden = null !== current2 && null !== current2.memoizedState || offscreenSubtreeWasHidden;
            current2 = offscreenSubtreeIsHidden;
            prevProps = offscreenSubtreeWasHidden;
            offscreenSubtreeIsHidden = flags;
            (offscreenSubtreeWasHidden = newOffscreenSubtreeWasHidden) && !prevProps ? (flags = 2, 0 !== (finishedWork.subtreeFlags & 8772) && (flags |= 1), recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              flags
            )) : recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            offscreenSubtreeIsHidden = current2;
            offscreenSubtreeWasHidden = prevProps;
          }
          break;
        case 30:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
          break;
        case 7:
          flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
        default:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
      }
    }
    function hideOrUnhideAllChildren(parentFiber, isHidden) {
      for (parentFiber = parentFiber.child; null !== parentFiber; )
        hideOrUnhideAllChildrenOnFiber(parentFiber, isHidden), parentFiber = parentFiber.sibling;
    }
    function hideOrUnhideAllChildrenOnFiber(fiber, isHidden) {
      switch (fiber.tag) {
        case 5:
        case 26:
          try {
            var instance = fiber.stateNode;
            if (isHidden) {
              var style2 = instance.style;
              "function" === typeof style2.setProperty ? style2.setProperty("display", "none", "important") : style2.display = "none";
            } else {
              var instance$jscomp$0 = fiber.stateNode, styleProp = fiber.memoizedProps.style, display = void 0 !== styleProp && null !== styleProp && styleProp.hasOwnProperty("display") ? styleProp.display : null;
              instance$jscomp$0.style.display = null == display || "boolean" === typeof display ? "" : ("" + display).trim();
            }
          } catch (error) {
            captureCommitPhaseError(fiber, fiber.return, error);
          }
          hideOrUnhideNearestPortals(fiber, isHidden);
          break;
        case 6:
          try {
            fiber.stateNode.nodeValue = isHidden ? "" : fiber.memoizedProps, viewTransitionMutationContext = true;
          } catch (error) {
            captureCommitPhaseError(fiber, fiber.return, error);
          }
          break;
        case 18:
          try {
            var instance$jscomp$1 = fiber.stateNode;
            isHidden ? hideOrUnhideDehydratedBoundary(instance$jscomp$1, true) : hideOrUnhideDehydratedBoundary(fiber.stateNode, false);
          } catch (error) {
            captureCommitPhaseError(fiber, fiber.return, error);
          }
          break;
        case 22:
        case 23:
          null === fiber.memoizedState && hideOrUnhideAllChildren(fiber, isHidden);
          break;
        default:
          hideOrUnhideAllChildren(fiber, isHidden);
      }
    }
    function hideOrUnhideNearestPortals(parentFiber, isHidden$jscomp$0) {
      if (parentFiber.subtreeFlags & 67108864)
        for (parentFiber = parentFiber.child; null !== parentFiber; ) {
          a: {
            var fiber = parentFiber, isHidden = isHidden$jscomp$0;
            switch (fiber.tag) {
              case 4:
                hideOrUnhideAllChildrenOnFiber(fiber, isHidden);
                break a;
              case 22:
                null === fiber.memoizedState && hideOrUnhideNearestPortals(fiber, isHidden);
                break a;
              default:
                hideOrUnhideNearestPortals(fiber, isHidden);
            }
          }
          parentFiber = parentFiber.sibling;
        }
    }
    function detachFiberAfterEffects(fiber) {
      var alternate = fiber.alternate;
      null !== alternate && (fiber.alternate = null, detachFiberAfterEffects(alternate));
      fiber.child = null;
      fiber.deletions = null;
      fiber.sibling = null;
      5 === fiber.tag && (alternate = fiber.stateNode, null !== alternate && detachDeletedInstance(alternate));
      fiber.stateNode = null;
      fiber.return = null;
      fiber.dependencies = null;
      fiber.memoizedProps = null;
      fiber.memoizedState = null;
      fiber.pendingProps = null;
      fiber.stateNode = null;
      fiber.updateQueue = null;
    }
    var hostParent = null;
    var hostParentIsContainer = false;
    function recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, parent) {
      for (parent = parent.child; null !== parent; )
        commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, parent), parent = parent.sibling;
    }
    function commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, deletedFiber) {
      if (injectedHook && "function" === typeof injectedHook.onCommitFiberUnmount)
        try {
          injectedHook.onCommitFiberUnmount(rendererID, deletedFiber);
        } catch (err) {
        }
      switch (deletedFiber.tag) {
        case 26:
          offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          deletedFiber.memoizedState ? deletedFiber.memoizedState.count-- : deletedFiber.stateNode && !offscreenSubtreeWasHidden && (deletedFiber = deletedFiber.stateNode, deletedFiber.parentNode.removeChild(deletedFiber));
          break;
        case 27:
          offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
          commitFragmentInstanceDeletionEffects(deletedFiber);
          var prevHostParent = hostParent, prevHostParentIsContainer = hostParentIsContainer;
          isSingletonScope(deletedFiber.type) && (hostParent = deletedFiber.stateNode, hostParentIsContainer = false);
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          releaseSingletonInstance(
            deletedFiber.stateNode,
            deletedFiber.type,
            deletedFiber.memoizedProps
          );
          hostParent = prevHostParent;
          hostParentIsContainer = prevHostParentIsContainer;
          break;
        case 5:
          offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor), commitFragmentInstanceDeletionEffects(deletedFiber);
        case 6:
          6 === deletedFiber.tag && commitFragmentInstanceDeletionEffects(deletedFiber);
          prevHostParent = hostParent;
          prevHostParentIsContainer = hostParentIsContainer;
          hostParent = null;
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          hostParent = prevHostParent;
          hostParentIsContainer = prevHostParentIsContainer;
          if (null !== hostParent)
            if (hostParentIsContainer)
              try {
                (9 === hostParent.nodeType ? hostParent.body : "HTML" === hostParent.nodeName ? hostParent.ownerDocument.body : hostParent).removeChild(deletedFiber.stateNode), viewTransitionMutationContext = true;
              } catch (error) {
                captureCommitPhaseError(
                  deletedFiber,
                  nearestMountedAncestor,
                  error
                );
              }
            else
              try {
                hostParent.removeChild(deletedFiber.stateNode), viewTransitionMutationContext = true;
              } catch (error) {
                captureCommitPhaseError(
                  deletedFiber,
                  nearestMountedAncestor,
                  error
                );
              }
          break;
        case 18:
          null !== hostParent && (hostParentIsContainer ? (finishedRoot = hostParent, clearHydrationBoundary(
            9 === finishedRoot.nodeType ? finishedRoot.body : "HTML" === finishedRoot.nodeName ? finishedRoot.ownerDocument.body : finishedRoot,
            deletedFiber.stateNode
          ), retryIfBlockedOn(finishedRoot)) : clearHydrationBoundary(hostParent, deletedFiber.stateNode));
          break;
        case 4:
          prevHostParent = hostParent;
          prevHostParentIsContainer = hostParentIsContainer;
          hostParent = deletedFiber.stateNode.containerInfo;
          hostParentIsContainer = true;
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          hostParent = prevHostParent;
          hostParentIsContainer = prevHostParentIsContainer;
          break;
        case 0:
        case 11:
        case 14:
        case 15:
          commitHookEffectListUnmount(2, deletedFiber, nearestMountedAncestor);
          offscreenSubtreeWasHidden || commitHookEffectListUnmount(4, deletedFiber, nearestMountedAncestor);
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          break;
        case 1:
          offscreenSubtreeWasHidden || (safelyDetachRef(deletedFiber, nearestMountedAncestor), prevHostParent = deletedFiber.stateNode, "function" === typeof prevHostParent.componentWillUnmount && safelyCallComponentWillUnmount(
            deletedFiber,
            nearestMountedAncestor,
            prevHostParent
          ));
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          break;
        case 21:
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          break;
        case 22:
          offscreenSubtreeWasHidden = (prevHostParent = offscreenSubtreeWasHidden) || null !== deletedFiber.memoizedState;
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          offscreenSubtreeWasHidden = prevHostParent;
          break;
        case 30:
          safelyDetachRef(deletedFiber, nearestMountedAncestor);
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          break;
        case 7:
          offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          break;
        default:
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
      }
    }
    function commitActivityHydrationCallbacks(finishedRoot, finishedWork) {
      if (null === finishedWork.memoizedState && (finishedRoot = finishedWork.alternate, null !== finishedRoot && (finishedRoot = finishedRoot.memoizedState, null !== finishedRoot))) {
        finishedRoot = finishedRoot.dehydrated;
        try {
          retryIfBlockedOn(finishedRoot);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
    }
    function commitSuspenseHydrationCallbacks(finishedRoot, finishedWork) {
      if (null === finishedWork.memoizedState && (finishedRoot = finishedWork.alternate, null !== finishedRoot && (finishedRoot = finishedRoot.memoizedState, null !== finishedRoot && (finishedRoot = finishedRoot.dehydrated, null !== finishedRoot))))
        try {
          retryIfBlockedOn(finishedRoot);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
    }
    function getRetryCache(finishedWork) {
      switch (finishedWork.tag) {
        case 31:
        case 13:
        case 19:
          var retryCache = finishedWork.stateNode;
          null === retryCache && (retryCache = finishedWork.stateNode = new PossiblyWeakSet());
          return retryCache;
        case 22:
          return finishedWork = finishedWork.stateNode, retryCache = finishedWork._retryCache, null === retryCache && (retryCache = finishedWork._retryCache = new PossiblyWeakSet()), retryCache;
        default:
          throw Error(formatProdErrorMessage(435, finishedWork.tag));
      }
    }
    function attachSuspenseRetryListeners(finishedWork, wakeables) {
      var retryCache = getRetryCache(finishedWork);
      wakeables.forEach(function(wakeable) {
        if (!retryCache.has(wakeable)) {
          retryCache.add(wakeable);
          var retry = resolveRetryWakeable.bind(null, finishedWork, wakeable);
          wakeable.then(retry, retry);
        }
      });
    }
    function recursivelyTraverseMutationEffects(root$jscomp$0, parentFiber, lanes) {
      var deletions = parentFiber.deletions;
      if (null !== deletions)
        for (var i = 0; i < deletions.length; i++) {
          var childToDelete = deletions[i], root2 = root$jscomp$0, returnFiber = parentFiber, parent = returnFiber;
          a: for (; null !== parent; ) {
            switch (parent.tag) {
              case 27:
                if (isSingletonScope(parent.type)) {
                  hostParent = parent.stateNode;
                  hostParentIsContainer = false;
                  break a;
                }
                break;
              case 5:
                hostParent = parent.stateNode;
                hostParentIsContainer = false;
                break a;
              case 3:
              case 4:
                hostParent = parent.stateNode.containerInfo;
                hostParentIsContainer = true;
                break a;
            }
            parent = parent.return;
          }
          if (null === hostParent) throw Error(formatProdErrorMessage(160));
          commitDeletionEffectsOnFiber(root2, returnFiber, childToDelete);
          hostParent = null;
          hostParentIsContainer = false;
          root2 = childToDelete.alternate;
          null !== root2 && (root2.return = null);
          childToDelete.return = null;
        }
      if (parentFiber.subtreeFlags & 13886)
        for (parentFiber = parentFiber.child; null !== parentFiber; )
          commitMutationEffectsOnFiber(parentFiber, root$jscomp$0, lanes), parentFiber = parentFiber.sibling;
    }
    var currentHoistableRoot = null;
    function commitMutationEffectsOnFiber(finishedWork, root2, lanes) {
      var current2 = finishedWork.alternate, flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          if (flags & 4 && (current2 = finishedWork.updateQueue, current2 = null !== current2 ? current2.events : null, null !== current2))
            for (var ii = 0; ii < current2.length; ii++) {
              var _eventPayloads$ii2 = current2[ii];
              _eventPayloads$ii2.ref.impl = _eventPayloads$ii2.nextImpl;
            }
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          commitReconciliationEffects(finishedWork);
          flags & 4 && (commitHookEffectListUnmount(3, finishedWork, finishedWork.return), commitHookEffectListMount(3, finishedWork), commitHookEffectListUnmount(5, finishedWork, finishedWork.return));
          break;
        case 1:
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || null === current2 || safelyDetachRef(current2, current2.return));
          flags & 64 && offscreenSubtreeIsHidden && (finishedWork = finishedWork.updateQueue, null !== finishedWork && (root2 = finishedWork.callbacks, null !== root2 && (lanes = finishedWork.shared.hiddenCallbacks, finishedWork.shared.hiddenCallbacks = null === lanes ? root2 : lanes.concat(root2))));
          break;
        case 26:
          ii = currentHoistableRoot;
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || null === current2 || safelyDetachRef(current2, current2.return));
          if (flags & 4)
            if (flags = null !== current2 ? current2.memoizedState : null, lanes = finishedWork.memoizedState, null === current2)
              if (null === lanes)
                if (null === finishedWork.stateNode)
                  if (offscreenSubtreeIsHidden)
                    finishedWork.stateNode = createHoistableInstance(
                      finishedWork.type,
                      finishedWork.memoizedProps,
                      root2.containerInfo,
                      finishedWork
                    );
                  else {
                    a: {
                      root2 = finishedWork.type;
                      lanes = finishedWork.memoizedProps;
                      flags = ii.ownerDocument || ii;
                      b: switch (root2) {
                        case "title":
                          current2 = flags.getElementsByTagName("title")[0];
                          if (!current2 || current2[internalHoistableMarker] || current2[internalInstanceKey] || "http://www.w3.org/2000/svg" === current2.namespaceURI || current2.hasAttribute("itemprop"))
                            current2 = flags.createElement(root2), flags.head.insertBefore(
                              current2,
                              flags.querySelector("head > title")
                            );
                          setInitialProperties(current2, root2, lanes);
                          current2[internalInstanceKey] = finishedWork;
                          markNodeAsHoistable(current2);
                          root2 = current2;
                          break a;
                        case "link":
                          if (ii = getHydratableHoistableCache(
                            "link",
                            "href",
                            flags
                          ).get(root2 + (lanes.href || ""))) {
                            for (_eventPayloads$ii2 = 0; _eventPayloads$ii2 < ii.length; _eventPayloads$ii2++)
                              if (current2 = ii[_eventPayloads$ii2], current2.getAttribute("href") === (null == lanes.href || "" === lanes.href ? null : lanes.href) && current2.getAttribute("rel") === (null == lanes.rel ? null : lanes.rel) && current2.getAttribute("title") === (null == lanes.title ? null : lanes.title) && current2.getAttribute("crossorigin") === (null == lanes.crossOrigin ? null : lanes.crossOrigin)) {
                                ii.splice(_eventPayloads$ii2, 1);
                                break b;
                              }
                          }
                          current2 = flags.createElement(root2);
                          setInitialProperties(current2, root2, lanes);
                          flags.head.appendChild(current2);
                          break;
                        case "meta":
                          if (ii = getHydratableHoistableCache(
                            "meta",
                            "content",
                            flags
                          ).get(root2 + (lanes.content || ""))) {
                            for (_eventPayloads$ii2 = 0; _eventPayloads$ii2 < ii.length; _eventPayloads$ii2++)
                              if (current2 = ii[_eventPayloads$ii2], current2.getAttribute("content") === (null == lanes.content ? null : "" + lanes.content) && current2.getAttribute("name") === (null == lanes.name ? null : lanes.name) && current2.getAttribute("property") === (null == lanes.property ? null : lanes.property) && current2.getAttribute("http-equiv") === (null == lanes.httpEquiv ? null : lanes.httpEquiv) && current2.getAttribute("charset") === (null == lanes.charSet ? null : lanes.charSet)) {
                                ii.splice(_eventPayloads$ii2, 1);
                                break b;
                              }
                          }
                          current2 = flags.createElement(root2);
                          setInitialProperties(current2, root2, lanes);
                          flags.head.appendChild(current2);
                          break;
                        default:
                          throw Error(formatProdErrorMessage(468, root2));
                      }
                      current2[internalInstanceKey] = finishedWork;
                      markNodeAsHoistable(current2);
                      root2 = current2;
                    }
                    finishedWork.stateNode = root2;
                  }
                else
                  offscreenSubtreeIsHidden || mountHoistable(ii, finishedWork.type, finishedWork.stateNode);
              else
                finishedWork.stateNode = acquireResource(
                  ii,
                  lanes,
                  finishedWork.memoizedProps
                );
            else
              flags !== lanes ? (null === flags ? (root2 = current2.stateNode, null === root2 || offscreenSubtreeWasHidden || root2.parentNode.removeChild(root2)) : flags.count--, null === lanes ? offscreenSubtreeIsHidden || mountHoistable(ii, finishedWork.type, finishedWork.stateNode) : acquireResource(ii, lanes, finishedWork.memoizedProps)) : null === lanes && null !== finishedWork.stateNode && commitHostUpdate(
                finishedWork,
                finishedWork.memoizedProps,
                current2.memoizedProps
              );
          break;
        case 27:
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || null === current2 || safelyDetachRef(current2, current2.return));
          null !== current2 && flags & 4 && commitHostUpdate(
            finishedWork,
            finishedWork.memoizedProps,
            current2.memoizedProps
          );
          break;
        case 5:
          ii = offscreenDirectParentIsHidden;
          offscreenDirectParentIsHidden = false;
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          offscreenDirectParentIsHidden = ii;
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || null === current2 || safelyDetachRef(current2, current2.return));
          if (finishedWork.flags & 32) {
            root2 = finishedWork.stateNode;
            try {
              setTextContent(root2, ""), viewTransitionMutationContext = true;
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
          flags & 4 && null != finishedWork.stateNode && (root2 = finishedWork.memoizedProps, commitHostUpdate(
            finishedWork,
            root2,
            null !== current2 ? current2.memoizedProps : root2
          ));
          flags & 1024 && (needsFormReset = true);
          break;
        case 6:
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          commitReconciliationEffects(finishedWork);
          if (flags & 4) {
            if (null === finishedWork.stateNode)
              throw Error(formatProdErrorMessage(162));
            root2 = finishedWork.memoizedProps;
            lanes = finishedWork.stateNode;
            try {
              lanes.nodeValue = root2, viewTransitionMutationContext = true;
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
          break;
        case 3:
          viewTransitionMutationContext = false;
          tagCaches = null;
          ii = currentHoistableRoot;
          currentHoistableRoot = getHoistableRoot(root2.containerInfo);
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          currentHoistableRoot = ii;
          commitReconciliationEffects(finishedWork);
          if (flags & 4 && null !== current2 && current2.memoizedState.isDehydrated)
            try {
              retryIfBlockedOn(root2.containerInfo);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          needsFormReset && (needsFormReset = false, recursivelyResetForms(finishedWork));
          viewTransitionMutationContext = false;
          break;
        case 4:
          flags = offscreenDirectParentIsHidden;
          offscreenDirectParentIsHidden = offscreenSubtreeIsHidden;
          current2 = pushMutationContext();
          ii = currentHoistableRoot;
          currentHoistableRoot = getHoistableRoot(
            finishedWork.stateNode.containerInfo
          );
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          commitReconciliationEffects(finishedWork);
          currentHoistableRoot = ii;
          viewTransitionMutationContext && inUpdateViewTransition && (rootViewTransitionAffected = true);
          viewTransitionMutationContext = current2;
          offscreenDirectParentIsHidden = flags;
          break;
        case 12:
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          commitReconciliationEffects(finishedWork);
          break;
        case 31:
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          commitReconciliationEffects(finishedWork);
          flags & 4 && (root2 = finishedWork.updateQueue, null !== root2 && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, root2)));
          break;
        case 13:
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          commitReconciliationEffects(finishedWork);
          finishedWork.child.flags & 8192 && null !== finishedWork.memoizedState !== (null !== current2 && null !== current2.memoizedState) && (globalMostRecentFallbackTime = now3());
          flags & 4 && (root2 = finishedWork.updateQueue, null !== root2 && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, root2)));
          break;
        case 22:
          ii = null !== finishedWork.memoizedState;
          _eventPayloads$ii2 = null !== current2 && null !== current2.memoizedState;
          var prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden, prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden, prevOffscreenDirectParentIsHidden$166 = offscreenDirectParentIsHidden;
          offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden || ii;
          offscreenDirectParentIsHidden = prevOffscreenDirectParentIsHidden$166 || ii;
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden || _eventPayloads$ii2;
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
          offscreenDirectParentIsHidden = prevOffscreenDirectParentIsHidden$166;
          offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
          commitReconciliationEffects(finishedWork);
          flags & 8192 && (root2 = finishedWork.stateNode, root2._visibility = ii ? root2._visibility & -2 : root2._visibility | 1, !ii || null === current2 || _eventPayloads$ii2 || offscreenSubtreeIsHidden || offscreenSubtreeWasHidden || (root2 = _eventPayloads$ii2 || offscreenSubtreeWasHidden, lanes = offscreenSubtreeIsHidden, current2 = offscreenSubtreeWasHidden, offscreenSubtreeIsHidden = ii || offscreenSubtreeIsHidden, offscreenSubtreeWasHidden = root2, recursivelyTraverseDisappearLayoutEffects(finishedWork, 2), offscreenSubtreeIsHidden = lanes, offscreenSubtreeWasHidden = current2), !ii && offscreenDirectParentIsHidden || hideOrUnhideAllChildren(finishedWork, ii));
          flags & 4 && (root2 = finishedWork.updateQueue, null !== root2 && (lanes = root2.retryQueue, null !== lanes && (root2.retryQueue = null, attachSuspenseRetryListeners(finishedWork, lanes))));
          break;
        case 19:
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          commitReconciliationEffects(finishedWork);
          flags & 4 && (root2 = finishedWork.updateQueue, null !== root2 && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, root2)));
          break;
        case 30:
          flags & 512 && (offscreenSubtreeWasHidden || null === current2 || safelyDetachRef(current2, current2.return));
          flags = pushMutationContext();
          ii = inUpdateViewTransition;
          _eventPayloads$ii2 = (lanes & 335544064) === lanes;
          prevOffscreenSubtreeIsHidden = finishedWork.memoizedProps;
          inUpdateViewTransition = _eventPayloads$ii2 && "none" !== getViewTransitionClassName(
            prevOffscreenSubtreeIsHidden.default,
            prevOffscreenSubtreeIsHidden.update
          );
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes);
          commitReconciliationEffects(finishedWork);
          _eventPayloads$ii2 && null !== current2 && viewTransitionMutationContext && (finishedWork.flags |= 4);
          inUpdateViewTransition = ii;
          viewTransitionMutationContext = flags;
          break;
        case 21:
          break;
        case 7:
          flags & 512 && (offscreenSubtreeWasHidden || null === current2 || safelyDetachRef(current2, current2.return)), current2 && null !== current2.stateNode && (current2.stateNode._fragmentFiber = finishedWork);
        default:
          recursivelyTraverseMutationEffects(root2, finishedWork, lanes), commitReconciliationEffects(finishedWork);
      }
    }
    function commitReconciliationEffects(finishedWork) {
      var flags = finishedWork.flags;
      if (flags & 2) {
        try {
          for (var hostParentFiber, parentFiber = finishedWork.return; null !== parentFiber; ) {
            if (isHostParent(parentFiber)) {
              hostParentFiber = parentFiber;
              break;
            }
            parentFiber = parentFiber.return;
          }
          parentFiber = null;
          for (var parent = finishedWork.return; null !== parent; ) {
            if (isFragmentInstanceParent(parent)) {
              var fragmentInstance = parent.stateNode;
              null === parentFiber ? parentFiber = [fragmentInstance] : parentFiber.push(fragmentInstance);
            }
            if (isFragmentInstanceHostBoundary(parent)) break;
            parent = parent.return;
          }
          var JSCompiler_inline_result = parentFiber;
          if (null == hostParentFiber) throw Error(formatProdErrorMessage(160));
          switch (hostParentFiber.tag) {
            case 27:
              var parent$jscomp$0 = hostParentFiber.stateNode, before = getHostSibling(finishedWork);
              insertOrAppendPlacementNode(
                finishedWork,
                before,
                parent$jscomp$0,
                JSCompiler_inline_result
              );
              break;
            case 5:
              var parent$149 = hostParentFiber.stateNode;
              hostParentFiber.flags & 32 && (setTextContent(parent$149, ""), hostParentFiber.flags &= -33);
              var before$150 = getHostSibling(finishedWork);
              insertOrAppendPlacementNode(
                finishedWork,
                before$150,
                parent$149,
                JSCompiler_inline_result
              );
              break;
            case 3:
            case 4:
              var parent$151 = hostParentFiber.stateNode.containerInfo, before$152 = getHostSibling(finishedWork);
              insertOrAppendPlacementNodeIntoContainer(
                finishedWork,
                before$152,
                parent$151,
                JSCompiler_inline_result
              );
              break;
            default:
              throw Error(formatProdErrorMessage(161));
          }
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
        finishedWork.flags &= -3;
      }
      flags & 4096 && (finishedWork.flags &= -4097);
    }
    function recursivelyResetForms(parentFiber) {
      if (parentFiber.subtreeFlags & 1024)
        for (parentFiber = parentFiber.child; null !== parentFiber; ) {
          var fiber = parentFiber;
          recursivelyResetForms(fiber);
          5 === fiber.tag && fiber.flags & 1024 && (fiber = fiber.stateNode, _enabled = true, fiber.reset(), _enabled = false);
          parentFiber = parentFiber.sibling;
        }
    }
    function recursivelyTraverseAfterMutationEffects(root2, parentFiber) {
      if (parentFiber.subtreeFlags & 9270)
        for (parentFiber = parentFiber.child; null !== parentFiber; )
          commitAfterMutationEffectsOnFiber(parentFiber, root2), parentFiber = parentFiber.sibling;
      else measureNestedViewTransitions(parentFiber, false);
    }
    function commitAfterMutationEffectsOnFiber(finishedWork, root2) {
      var current2 = finishedWork.alternate;
      if (null === current2) commitEnterViewTransitions(finishedWork, false);
      else
        switch (finishedWork.tag) {
          case 3:
            rootViewTransitionNameCanceled = viewTransitionContextChanged = false;
            pushViewTransitionCancelableScope();
            recursivelyTraverseAfterMutationEffects(root2, finishedWork);
            if (!viewTransitionContextChanged && !rootViewTransitionAffected) {
              finishedWork = viewTransitionCancelableChildren;
              if (null !== finishedWork)
                for (var i = 0; i < finishedWork.length; i += 3) {
                  current2 = finishedWork[i];
                  var oldName = finishedWork[i + 1];
                  restoreViewTransitionName(current2, finishedWork[i + 2]);
                  current2 = current2.ownerDocument.documentElement;
                  null !== current2 && current2.animate(
                    { opacity: [0, 0], pointerEvents: ["none", "none"] },
                    {
                      duration: 0,
                      fill: "forwards",
                      pseudoElement: "::view-transition-group(" + oldName + ")"
                    }
                  );
                }
              finishedWork = root2.containerInfo;
              finishedWork = 9 === finishedWork.nodeType ? finishedWork.documentElement : finishedWork.ownerDocument.documentElement;
              null !== finishedWork && "" === finishedWork.style.viewTransitionName && (finishedWork.style.viewTransitionName = "none", finishedWork.animate(
                { opacity: [0, 0], pointerEvents: ["none", "none"] },
                {
                  duration: 0,
                  fill: "forwards",
                  pseudoElement: "::view-transition-group(root)"
                }
              ), finishedWork.animate(
                { width: [0, 0], height: [0, 0] },
                {
                  duration: 0,
                  fill: "forwards",
                  pseudoElement: "::view-transition"
                }
              ));
              rootViewTransitionNameCanceled = true;
            }
            viewTransitionCancelableChildren = null;
            break;
          case 5:
            recursivelyTraverseAfterMutationEffects(root2, finishedWork);
            break;
          case 4:
            i = viewTransitionContextChanged;
            viewTransitionContextChanged = false;
            recursivelyTraverseAfterMutationEffects(root2, finishedWork);
            viewTransitionContextChanged && (rootViewTransitionAffected = true);
            viewTransitionContextChanged = i;
            break;
          case 22:
            null === finishedWork.memoizedState && (null !== current2.memoizedState ? commitEnterViewTransitions(finishedWork, false) : recursivelyTraverseAfterMutationEffects(root2, finishedWork));
            break;
          case 30:
            i = viewTransitionContextChanged;
            oldName = pushViewTransitionCancelableScope();
            viewTransitionContextChanged = false;
            recursivelyTraverseAfterMutationEffects(root2, finishedWork);
            viewTransitionContextChanged && (finishedWork.flags |= 4);
            var props = finishedWork.memoizedProps, state = finishedWork.stateNode;
            root2 = getViewTransitionName(props, state);
            state = getViewTransitionName(current2.memoizedProps, state);
            var className = getViewTransitionClassName(props.default, props.update);
            "none" === className ? root2 = false : (props = current2.memoizedState, current2.memoizedState = null, current2 = finishedWork.child, viewTransitionHostInstanceIdx = 0, root2 = measureViewTransitionHostInstancesRecursive(
              finishedWork,
              current2,
              root2,
              state,
              className,
              props,
              true
            ), viewTransitionHostInstanceIdx !== (null === props ? 0 : props.length) && (finishedWork.flags |= 32));
            0 !== (finishedWork.flags & 4) && root2 ? (scheduleViewTransitionEvent(
              finishedWork,
              finishedWork.memoizedProps.onUpdate
            ), viewTransitionCancelableChildren = oldName) : null !== oldName && (oldName.push.apply(oldName, viewTransitionCancelableChildren), viewTransitionCancelableChildren = oldName);
            viewTransitionContextChanged = 0 !== (finishedWork.flags & 32) ? true : i;
            break;
          default:
            recursivelyTraverseAfterMutationEffects(root2, finishedWork);
        }
    }
    function recursivelyTraverseLayoutEffects(root2, parentFiber) {
      if (parentFiber.subtreeFlags & 8772)
        for (parentFiber = parentFiber.child; null !== parentFiber; )
          commitLayoutEffectOnFiber(root2, parentFiber.alternate, parentFiber), parentFiber = parentFiber.sibling;
    }
    function recursivelyTraverseDisappearLayoutEffects(parentFiber, layoutEffectTraversalFlags$jscomp$0) {
      for (parentFiber = parentFiber.child; null !== parentFiber; ) {
        var finishedWork = parentFiber, layoutEffectTraversalFlags = layoutEffectTraversalFlags$jscomp$0;
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 14:
          case 15:
            commitHookEffectListUnmount(4, finishedWork, finishedWork.return);
            recursivelyTraverseDisappearLayoutEffects(
              finishedWork,
              layoutEffectTraversalFlags
            );
            break;
          case 1:
            safelyDetachRef(finishedWork, finishedWork.return);
            var instance = finishedWork.stateNode;
            "function" === typeof instance.componentWillUnmount && safelyCallComponentWillUnmount(
              finishedWork,
              finishedWork.return,
              instance
            );
            recursivelyTraverseDisappearLayoutEffects(
              finishedWork,
              layoutEffectTraversalFlags
            );
            break;
          case 27:
            0 !== (layoutEffectTraversalFlags & 2) && releaseSingletonInstance(
              finishedWork.stateNode,
              finishedWork.type,
              finishedWork.memoizedProps
            );
          case 5:
            safelyDetachRef(finishedWork, finishedWork.return);
            5 !== finishedWork.tag && 27 !== finishedWork.tag || commitFragmentInstanceDeletionEffects(finishedWork);
            recursivelyTraverseDisappearLayoutEffects(
              finishedWork,
              layoutEffectTraversalFlags
            );
            break;
          case 6:
            commitFragmentInstanceDeletionEffects(finishedWork);
            break;
          case 26:
            safelyDetachRef(finishedWork, finishedWork.return);
            instance = finishedWork.stateNode;
            null !== finishedWork.memoizedState || null === instance || offscreenSubtreeWasHidden || instance.parentNode.removeChild(instance);
            recursivelyTraverseDisappearLayoutEffects(
              finishedWork,
              layoutEffectTraversalFlags
            );
            break;
          case 22:
            null === finishedWork.memoizedState && recursivelyTraverseDisappearLayoutEffects(
              finishedWork,
              layoutEffectTraversalFlags
            );
            break;
          case 30:
            safelyDetachRef(finishedWork, finishedWork.return);
            recursivelyTraverseDisappearLayoutEffects(
              finishedWork,
              layoutEffectTraversalFlags
            );
            break;
          case 7:
            safelyDetachRef(finishedWork, finishedWork.return);
          default:
            recursivelyTraverseDisappearLayoutEffects(
              finishedWork,
              layoutEffectTraversalFlags
            );
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function recursivelyTraverseReappearLayoutEffects(finishedRoot$jscomp$0, parentFiber, layoutEffectTraversalFlags) {
      layoutEffectTraversalFlags = 0 !== (parentFiber.subtreeFlags & 8772) ? layoutEffectTraversalFlags : layoutEffectTraversalFlags & -2;
      for (parentFiber = parentFiber.child; null !== parentFiber; ) {
        var current2 = parentFiber.alternate, finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags, includeWorkInProgressEffects = 0 !== (layoutEffectTraversalFlags & 1);
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 15:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              layoutEffectTraversalFlags
            );
            commitHookEffectListMount(4, finishedWork);
            break;
          case 1:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              layoutEffectTraversalFlags
            );
            current2 = finishedWork;
            finishedRoot = current2.stateNode;
            if ("function" === typeof finishedRoot.componentDidMount)
              try {
                finishedRoot.componentDidMount();
              } catch (error) {
                captureCommitPhaseError(current2, current2.return, error);
              }
            current2 = finishedWork;
            finishedRoot = current2.updateQueue;
            if (null !== finishedRoot) {
              var instance = current2.stateNode;
              try {
                var hiddenCallbacks = finishedRoot.shared.hiddenCallbacks;
                if (null !== hiddenCallbacks)
                  for (finishedRoot.shared.hiddenCallbacks = null, finishedRoot = 0; finishedRoot < hiddenCallbacks.length; finishedRoot++)
                    callCallback(hiddenCallbacks[finishedRoot], instance);
              } catch (error) {
                captureCommitPhaseError(current2, current2.return, error);
              }
            }
            includeWorkInProgressEffects && flags & 64 && commitClassCallbacks(finishedWork);
            safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 27:
            0 !== (layoutEffectTraversalFlags & 2) && commitHostSingletonAcquisition(finishedWork);
          case 5:
            5 !== finishedWork.tag && 27 !== finishedWork.tag || commitFragmentInstanceInsertionEffects(finishedWork);
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              layoutEffectTraversalFlags
            );
            includeWorkInProgressEffects && null === current2 && flags & 4 && commitHostMount(finishedWork);
            safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 6:
            commitFragmentInstanceInsertionEffects(finishedWork);
            break;
          case 26:
            instance = finishedWork.stateNode;
            null !== finishedWork.memoizedState || null === instance || offscreenSubtreeIsHidden || mountHoistable(
              getHoistableRoot(instance.ownerDocument),
              finishedWork.type,
              instance
            );
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              layoutEffectTraversalFlags
            );
            includeWorkInProgressEffects && null === current2 && flags & 4 && commitHostMount(finishedWork);
            safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 12:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              layoutEffectTraversalFlags
            );
            break;
          case 31:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              layoutEffectTraversalFlags
            );
            includeWorkInProgressEffects && flags & 4 && commitActivityHydrationCallbacks(finishedRoot, finishedWork);
            break;
          case 13:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              layoutEffectTraversalFlags
            );
            includeWorkInProgressEffects && flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
            break;
          case 22:
            null === finishedWork.memoizedState && recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              layoutEffectTraversalFlags
            );
            safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 30:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              layoutEffectTraversalFlags
            );
            safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 7:
            safelyAttachRef(finishedWork, finishedWork.return);
          default:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              layoutEffectTraversalFlags
            );
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function commitOffscreenPassiveMountEffects(current2, finishedWork) {
      var previousCache = null;
      null !== current2 && null !== current2.memoizedState && null !== current2.memoizedState.cachePool && (previousCache = current2.memoizedState.cachePool.pool);
      current2 = null;
      null !== finishedWork.memoizedState && null !== finishedWork.memoizedState.cachePool && (current2 = finishedWork.memoizedState.cachePool.pool);
      current2 !== previousCache && (null != current2 && current2.refCount++, null != previousCache && releaseCache(previousCache));
    }
    function commitCachePassiveMountEffect(current2, finishedWork) {
      current2 = null;
      null !== finishedWork.alternate && (current2 = finishedWork.alternate.memoizedState.cache);
      finishedWork = finishedWork.memoizedState.cache;
      finishedWork !== current2 && (finishedWork.refCount++, null != current2 && releaseCache(current2));
    }
    function recursivelyTraversePassiveMountEffects(root2, parentFiber, committedLanes, committedTransitions) {
      var isViewTransitionEligible = (committedLanes & 335544064) === committedLanes;
      if (parentFiber.subtreeFlags & (isViewTransitionEligible ? 10262 : 10256))
        for (parentFiber = parentFiber.child; null !== parentFiber; )
          commitPassiveMountOnFiber(
            root2,
            parentFiber,
            committedLanes,
            committedTransitions
          ), parentFiber = parentFiber.sibling;
      else isViewTransitionEligible && restoreNestedViewTransitions(parentFiber);
    }
    function commitPassiveMountOnFiber(finishedRoot, finishedWork, committedLanes, committedTransitions) {
      var isViewTransitionEligible = (committedLanes & 335544064) === committedLanes;
      isViewTransitionEligible && null === finishedWork.alternate && null !== finishedWork.return && null !== finishedWork.return.alternate && restoreEnterOrExitViewTransitions(finishedWork);
      var flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          flags & 2048 && commitHookEffectListMount(9, finishedWork);
          break;
        case 1:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          break;
        case 3:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          isViewTransitionEligible && rootViewTransitionNameCanceled && (finishedRoot = finishedRoot.containerInfo, finishedRoot = 9 === finishedRoot.nodeType ? finishedRoot.body : "HTML" === finishedRoot.nodeName ? finishedRoot.ownerDocument.body : finishedRoot, "root" === finishedRoot.style.viewTransitionName && (finishedRoot.style.viewTransitionName = ""), finishedRoot = finishedRoot.ownerDocument.documentElement, null !== finishedRoot && "none" === finishedRoot.style.viewTransitionName && (finishedRoot.style.viewTransitionName = ""));
          flags & 2048 && (flags = null, null !== finishedWork.alternate && (flags = finishedWork.alternate.memoizedState.cache), finishedWork = finishedWork.memoizedState.cache, finishedWork !== flags && (finishedWork.refCount++, null != flags && releaseCache(flags)));
          break;
        case 12:
          if (flags & 2048) {
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            );
            flags = finishedWork.stateNode;
            try {
              var _finishedWork$memoize2 = finishedWork.memoizedProps, id = _finishedWork$memoize2.id, onPostCommit = _finishedWork$memoize2.onPostCommit;
              "function" === typeof onPostCommit && onPostCommit(
                id,
                null === finishedWork.alternate ? "mount" : "update",
                flags.passiveEffectDuration,
                -0
              );
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          } else
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            );
          break;
        case 31:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          break;
        case 13:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          break;
        case 23:
          break;
        case 22:
          _finishedWork$memoize2 = finishedWork.stateNode;
          id = finishedWork.alternate;
          null !== finishedWork.memoizedState ? (isViewTransitionEligible && null !== id && null === id.memoizedState && restoreEnterOrExitViewTransitions(id), _finishedWork$memoize2._visibility & 2 ? recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          ) : recursivelyTraverseAtomicPassiveEffects(
            finishedRoot,
            finishedWork
          )) : (isViewTransitionEligible && null !== id && null !== id.memoizedState && restoreEnterOrExitViewTransitions(finishedWork), _finishedWork$memoize2._visibility & 2 ? recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          ) : (_finishedWork$memoize2._visibility |= 2, recursivelyTraverseReconnectPassiveEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions,
            0 !== (finishedWork.subtreeFlags & 10256) || false
          )));
          flags & 2048 && commitOffscreenPassiveMountEffects(id, finishedWork);
          break;
        case 24:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
          break;
        case 30:
          isViewTransitionEligible && (flags = finishedWork.alternate, null !== flags && (restoreViewTransitionOnHostInstances(flags.child, true), restoreViewTransitionOnHostInstances(finishedWork.child, true)));
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          break;
        default:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
      }
    }
    function recursivelyTraverseReconnectPassiveEffects(finishedRoot$jscomp$0, parentFiber, committedLanes$jscomp$0, committedTransitions$jscomp$0, includeWorkInProgressEffects) {
      includeWorkInProgressEffects = includeWorkInProgressEffects && (0 !== (parentFiber.subtreeFlags & 10256) || false);
      for (parentFiber = parentFiber.child; null !== parentFiber; ) {
        var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, committedLanes = committedLanes$jscomp$0, committedTransitions = committedTransitions$jscomp$0, flags = finishedWork.flags;
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 15:
            recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              includeWorkInProgressEffects
            );
            commitHookEffectListMount(8, finishedWork);
            break;
          case 23:
            break;
          case 22:
            var instance = finishedWork.stateNode;
            null !== finishedWork.memoizedState ? instance._visibility & 2 ? recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              includeWorkInProgressEffects
            ) : recursivelyTraverseAtomicPassiveEffects(
              finishedRoot,
              finishedWork
            ) : (instance._visibility |= 2, recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              includeWorkInProgressEffects
            ));
            includeWorkInProgressEffects && flags & 2048 && commitOffscreenPassiveMountEffects(
              finishedWork.alternate,
              finishedWork
            );
            break;
          case 24:
            recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              includeWorkInProgressEffects
            );
            includeWorkInProgressEffects && flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
            break;
          default:
            recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              includeWorkInProgressEffects
            );
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function recursivelyTraverseAtomicPassiveEffects(finishedRoot$jscomp$0, parentFiber) {
      if (parentFiber.subtreeFlags & 10256)
        for (parentFiber = parentFiber.child; null !== parentFiber; ) {
          var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags;
          switch (finishedWork.tag) {
            case 22:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
              flags & 2048 && commitOffscreenPassiveMountEffects(
                finishedWork.alternate,
                finishedWork
              );
              break;
            case 24:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
              flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
              break;
            default:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
          }
          parentFiber = parentFiber.sibling;
        }
    }
    var suspenseyCommitFlag = 8192;
    function recursivelyAccumulateSuspenseyCommit(parentFiber, committedLanes, suspendedState) {
      if (parentFiber.subtreeFlags & suspenseyCommitFlag)
        for (parentFiber = parentFiber.child; null !== parentFiber; )
          accumulateSuspenseyCommitOnFiber(
            parentFiber,
            committedLanes,
            suspendedState
          ), parentFiber = parentFiber.sibling;
    }
    function accumulateSuspenseyCommitOnFiber(fiber, committedLanes, suspendedState) {
      switch (fiber.tag) {
        case 26:
          recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          );
          fiber.flags & suspenseyCommitFlag && (null !== fiber.memoizedState ? suspendResource(
            suspendedState,
            currentHoistableRoot,
            fiber.memoizedState,
            fiber.memoizedProps
          ) : (fiber = fiber.stateNode, (committedLanes & 335544128) === committedLanes && suspendInstance(suspendedState, fiber)));
          break;
        case 5:
          recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          );
          fiber.flags & suspenseyCommitFlag && (fiber = fiber.stateNode, (committedLanes & 335544128) === committedLanes && suspendInstance(suspendedState, fiber));
          break;
        case 3:
        case 4:
          var previousHoistableRoot = currentHoistableRoot;
          currentHoistableRoot = getHoistableRoot(fiber.stateNode.containerInfo);
          recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          );
          currentHoistableRoot = previousHoistableRoot;
          break;
        case 22:
          null === fiber.memoizedState && (previousHoistableRoot = fiber.alternate, null !== previousHoistableRoot && null !== previousHoistableRoot.memoizedState ? (previousHoistableRoot = suspenseyCommitFlag, suspenseyCommitFlag = 16777216, recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          ), suspenseyCommitFlag = previousHoistableRoot) : recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          ));
          break;
        case 30:
          if (0 !== (fiber.flags & suspenseyCommitFlag) && (previousHoistableRoot = fiber.memoizedProps.name, null != previousHoistableRoot && "auto" !== previousHoistableRoot)) {
            var state = fiber.stateNode;
            state.paired = null;
            null === appearingViewTransitions && (appearingViewTransitions = /* @__PURE__ */ new Map());
            appearingViewTransitions.set(previousHoistableRoot, state);
          }
          recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          );
          break;
        default:
          recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          );
      }
    }
    function detachAlternateSiblings(parentFiber) {
      var previousFiber = parentFiber.alternate;
      if (null !== previousFiber && (parentFiber = previousFiber.child, null !== parentFiber)) {
        previousFiber.child = null;
        do
          previousFiber = parentFiber.sibling, parentFiber.sibling = null, parentFiber = previousFiber;
        while (null !== parentFiber);
      }
    }
    function recursivelyTraversePassiveUnmountEffects(parentFiber) {
      var deletions = parentFiber.deletions;
      if (0 !== (parentFiber.flags & 16)) {
        if (null !== deletions)
          for (var i = 0; i < deletions.length; i++) {
            var childToDelete = deletions[i];
            nextEffect = childToDelete;
            commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
              childToDelete,
              parentFiber
            );
          }
        detachAlternateSiblings(parentFiber);
      }
      if (parentFiber.subtreeFlags & 10256)
        for (parentFiber = parentFiber.child; null !== parentFiber; )
          commitPassiveUnmountOnFiber(parentFiber), parentFiber = parentFiber.sibling;
    }
    function commitPassiveUnmountOnFiber(finishedWork) {
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          finishedWork.flags & 2048 && commitHookEffectListUnmount(9, finishedWork, finishedWork.return);
          break;
        case 3:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          break;
        case 12:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          break;
        case 22:
          var instance = finishedWork.stateNode;
          null !== finishedWork.memoizedState && instance._visibility & 2 && (null === finishedWork.return || 13 !== finishedWork.return.tag) ? (instance._visibility &= -3, recursivelyTraverseDisconnectPassiveEffects(finishedWork)) : recursivelyTraversePassiveUnmountEffects(finishedWork);
          break;
        default:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
      }
    }
    function recursivelyTraverseDisconnectPassiveEffects(parentFiber) {
      var deletions = parentFiber.deletions;
      if (0 !== (parentFiber.flags & 16)) {
        if (null !== deletions)
          for (var i = 0; i < deletions.length; i++) {
            var childToDelete = deletions[i];
            nextEffect = childToDelete;
            commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
              childToDelete,
              parentFiber
            );
          }
        detachAlternateSiblings(parentFiber);
      }
      for (parentFiber = parentFiber.child; null !== parentFiber; ) {
        deletions = parentFiber;
        switch (deletions.tag) {
          case 0:
          case 11:
          case 15:
            commitHookEffectListUnmount(8, deletions, deletions.return);
            recursivelyTraverseDisconnectPassiveEffects(deletions);
            break;
          case 22:
            i = deletions.stateNode;
            i._visibility & 2 && (i._visibility &= -3, recursivelyTraverseDisconnectPassiveEffects(deletions));
            break;
          default:
            recursivelyTraverseDisconnectPassiveEffects(deletions);
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function commitPassiveUnmountEffectsInsideOfDeletedTree_begin(deletedSubtreeRoot, nearestMountedAncestor) {
      for (; null !== nextEffect; ) {
        var fiber = nextEffect;
        switch (fiber.tag) {
          case 0:
          case 11:
          case 15:
            commitHookEffectListUnmount(8, fiber, nearestMountedAncestor);
            break;
          case 23:
          case 22:
            if (null !== fiber.memoizedState && null !== fiber.memoizedState.cachePool) {
              var cache = fiber.memoizedState.cachePool.pool;
              null != cache && cache.refCount++;
            }
            break;
          case 24:
            releaseCache(fiber.memoizedState.cache);
        }
        cache = fiber.child;
        if (null !== cache) cache.return = fiber, nextEffect = cache;
        else
          a: for (fiber = deletedSubtreeRoot; null !== nextEffect; ) {
            cache = nextEffect;
            var sibling = cache.sibling, returnFiber = cache.return;
            detachFiberAfterEffects(cache);
            if (cache === fiber) {
              nextEffect = null;
              break a;
            }
            if (null !== sibling) {
              sibling.return = returnFiber;
              nextEffect = sibling;
              break a;
            }
            nextEffect = returnFiber;
          }
      }
    }
    var DefaultAsyncDispatcher = {
      getCacheForType: function(resourceType) {
        var cache = readContext(CacheContext), cacheForType = cache.data.get(resourceType);
        void 0 === cacheForType && (cacheForType = resourceType(), cache.data.set(resourceType, cacheForType));
        return cacheForType;
      },
      cacheSignal: function() {
        return readContext(CacheContext).controller.signal;
      }
    };
    var PossiblyWeakMap = "function" === typeof WeakMap ? WeakMap : Map;
    var executionContext = 0;
    var workInProgressRoot = null;
    var workInProgress = null;
    var workInProgressRootRenderLanes = 0;
    var workInProgressSuspendedReason = 0;
    var workInProgressThrownValue = null;
    var workInProgressRootDidSkipSuspendedSiblings = false;
    var workInProgressRootIsPrerendering = false;
    var workInProgressRootDidAttachPingListener = false;
    var entangledRenderLanes = 0;
    var workInProgressRootExitStatus = 0;
    var workInProgressRootSkippedLanes = 0;
    var workInProgressRootInterleavedUpdatedLanes = 0;
    var workInProgressRootPingedLanes = 0;
    var workInProgressDeferredLane = 0;
    var workInProgressSuspendedRetryLanes = 0;
    var workInProgressRootConcurrentErrors = null;
    var workInProgressRootRecoverableErrors = null;
    var workInProgressRootDidIncludeRecursiveRenderUpdate = false;
    var globalMostRecentFallbackTime = 0;
    var globalMostRecentTransitionTime = 0;
    var workInProgressRootRenderTargetTime = Infinity;
    var workInProgressTransitions = null;
    var legacyErrorBoundariesThatAlreadyFailed = null;
    var pendingEffectsStatus = 0;
    var pendingEffectsRoot = null;
    var pendingFinishedWork = null;
    var pendingEffectsLanes = 0;
    var pendingEffectsRemainingLanes = 0;
    var pendingPassiveTransitions = null;
    var pendingRecoverableErrors = null;
    var pendingViewTransition = null;
    var pendingViewTransitionEvents = null;
    var pendingTransitionTypes = null;
    var nestedUpdateCount = 0;
    var rootWithNestedUpdates = null;
    function requestUpdateLane() {
      return 0 !== (executionContext & 2) && 0 !== workInProgressRootRenderLanes ? workInProgressRootRenderLanes & -workInProgressRootRenderLanes : null !== ReactSharedInternals.T ? requestTransitionLane() : resolveUpdatePriority();
    }
    function requestDeferredLane() {
      if (0 === workInProgressDeferredLane)
        if (0 === (workInProgressRootRenderLanes & 536870912) || isHydrating) {
          var lane = nextTransitionDeferredLane;
          nextTransitionDeferredLane <<= 1;
          0 === (nextTransitionDeferredLane & 3932160) && (nextTransitionDeferredLane = 262144);
          workInProgressDeferredLane = lane;
        } else workInProgressDeferredLane = 536870912;
      lane = suspenseHandlerStackCursor.current;
      null !== lane && (lane.flags |= 32);
      return workInProgressDeferredLane;
    }
    function scheduleViewTransitionEvent(fiber, callback) {
      if (null != callback) {
        var state = fiber.stateNode, instance = state.ref;
        null === instance && (instance = state.ref = createViewTransitionInstance(
          getViewTransitionName(fiber.memoizedProps, state)
        ));
        null === pendingViewTransitionEvents && (pendingViewTransitionEvents = []);
        pendingViewTransitionEvents.push(callback.bind(null, instance));
      }
    }
    function scheduleUpdateOnFiber(root2, fiber, lane) {
      if (root2 === workInProgressRoot && (2 === workInProgressSuspendedReason || 9 === workInProgressSuspendedReason) || null !== root2.cancelPendingCommit)
        prepareFreshStack(root2, 0), markRootSuspended(
          root2,
          workInProgressRootRenderLanes,
          workInProgressDeferredLane,
          false
        );
      markRootUpdated$1(root2, lane);
      if (0 === (executionContext & 2) || root2 !== workInProgressRoot)
        root2 === workInProgressRoot && (0 === (executionContext & 2) && (workInProgressRootInterleavedUpdatedLanes |= lane), 4 === workInProgressRootExitStatus && markRootSuspended(
          root2,
          workInProgressRootRenderLanes,
          workInProgressDeferredLane,
          false
        )), ensureRootIsScheduled(root2);
    }
    function performWorkOnRoot(root$jscomp$0, lanes, forceSync) {
      if (0 !== (executionContext & 6)) throw Error(formatProdErrorMessage(327));
      var shouldTimeSlice = !forceSync && 0 === (lanes & 127) && 0 === (lanes & root$jscomp$0.expiredLanes) || checkIfRootIsPrerendering(root$jscomp$0, lanes), exitStatus = shouldTimeSlice ? renderRootConcurrent(root$jscomp$0, lanes) : renderRootSync(root$jscomp$0, lanes, true), renderWasConcurrent = shouldTimeSlice;
      do {
        if (0 === exitStatus) {
          workInProgressRootIsPrerendering && !shouldTimeSlice && markRootSuspended(root$jscomp$0, lanes, 0, false);
          break;
        } else {
          forceSync = root$jscomp$0.current.alternate;
          if (renderWasConcurrent && !isRenderConsistentWithExternalStores(forceSync)) {
            exitStatus = renderRootSync(root$jscomp$0, lanes, false);
            renderWasConcurrent = false;
            continue;
          }
          if (2 === exitStatus) {
            renderWasConcurrent = lanes;
            if (root$jscomp$0.errorRecoveryDisabledLanes & renderWasConcurrent)
              var JSCompiler_inline_result = 0;
            else
              JSCompiler_inline_result = root$jscomp$0.pendingLanes & -536870913, JSCompiler_inline_result = 0 !== JSCompiler_inline_result ? JSCompiler_inline_result : JSCompiler_inline_result & 536870912 ? 536870912 : 0;
            if (0 !== JSCompiler_inline_result) {
              lanes = JSCompiler_inline_result;
              a: {
                var root2 = root$jscomp$0;
                exitStatus = workInProgressRootConcurrentErrors;
                var wasRootDehydrated = root2.current.memoizedState.isDehydrated;
                wasRootDehydrated && (prepareFreshStack(root2, JSCompiler_inline_result).flags |= 256);
                JSCompiler_inline_result = renderRootSync(
                  root2,
                  JSCompiler_inline_result,
                  false
                );
                if (2 !== JSCompiler_inline_result && 6 !== JSCompiler_inline_result) {
                  if (workInProgressRootDidAttachPingListener && !wasRootDehydrated) {
                    root2.errorRecoveryDisabledLanes |= renderWasConcurrent;
                    workInProgressRootInterleavedUpdatedLanes |= renderWasConcurrent;
                    exitStatus = 4;
                    break a;
                  }
                  renderWasConcurrent = workInProgressRootRecoverableErrors;
                  workInProgressRootRecoverableErrors = exitStatus;
                  null !== renderWasConcurrent && (null === workInProgressRootRecoverableErrors ? workInProgressRootRecoverableErrors = renderWasConcurrent : workInProgressRootRecoverableErrors.push.apply(
                    workInProgressRootRecoverableErrors,
                    renderWasConcurrent
                  ));
                }
                exitStatus = JSCompiler_inline_result;
              }
              renderWasConcurrent = false;
              if (2 !== exitStatus) continue;
            }
          }
          if (1 === exitStatus) {
            prepareFreshStack(root$jscomp$0, 0);
            markRootSuspended(root$jscomp$0, lanes, 0, true);
            break;
          }
          a: {
            shouldTimeSlice = root$jscomp$0;
            renderWasConcurrent = exitStatus;
            switch (renderWasConcurrent) {
              case 0:
              case 1:
                throw Error(formatProdErrorMessage(345));
              case 4:
                if ((lanes & 4194048) !== lanes && (lanes & 62914560) !== lanes)
                  break;
              case 6:
                markRootSuspended(
                  shouldTimeSlice,
                  lanes,
                  workInProgressDeferredLane,
                  !workInProgressRootDidSkipSuspendedSiblings
                );
                break a;
              case 2:
                workInProgressRootRecoverableErrors = null;
                break;
              case 3:
              case 5:
                break;
              default:
                throw Error(formatProdErrorMessage(329));
            }
            if ((lanes & 62914560) === lanes && (exitStatus = globalMostRecentFallbackTime + 300 - now3(), 10 < exitStatus)) {
              markRootSuspended(
                shouldTimeSlice,
                lanes,
                workInProgressDeferredLane,
                !workInProgressRootDidSkipSuspendedSiblings
              );
              if (0 !== getNextLanes(shouldTimeSlice, 0, true)) break a;
              pendingEffectsLanes = lanes;
              shouldTimeSlice.timeoutHandle = scheduleTimeout(
                completeRootWhenReady.bind(
                  null,
                  shouldTimeSlice,
                  forceSync,
                  workInProgressRootRecoverableErrors,
                  workInProgressTransitions,
                  workInProgressRootDidIncludeRecursiveRenderUpdate,
                  lanes,
                  workInProgressDeferredLane,
                  workInProgressRootInterleavedUpdatedLanes,
                  workInProgressSuspendedRetryLanes,
                  workInProgressRootDidSkipSuspendedSiblings,
                  renderWasConcurrent,
                  "Throttled",
                  -0,
                  0
                ),
                exitStatus
              );
              break a;
            }
            completeRootWhenReady(
              shouldTimeSlice,
              forceSync,
              workInProgressRootRecoverableErrors,
              workInProgressTransitions,
              workInProgressRootDidIncludeRecursiveRenderUpdate,
              lanes,
              workInProgressDeferredLane,
              workInProgressRootInterleavedUpdatedLanes,
              workInProgressSuspendedRetryLanes,
              workInProgressRootDidSkipSuspendedSiblings,
              renderWasConcurrent,
              null,
              -0,
              0
            );
          }
        }
        break;
      } while (1);
      ensureRootIsScheduled(root$jscomp$0);
    }
    function completeRootWhenReady(root2, finishedWork, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, lanes, spawnedLane, updatedLanes, suspendedRetryLanes, didSkipSuspendedSiblings, exitStatus, suspendedCommitReason, completedRenderStartTime, completedRenderEndTime) {
      root2.timeoutHandle = -1;
      var subtreeFlags = finishedWork.subtreeFlags, isViewTransitionEligible = (lanes & 335544064) === lanes;
      suspendedCommitReason = null;
      if (isViewTransitionEligible || subtreeFlags & 8192 || 16785408 === (subtreeFlags & 16785408)) {
        if (suspendedCommitReason = {
          stylesheets: null,
          count: 0,
          imgCount: 0,
          imgBytes: 0,
          suspenseyImages: [],
          waitingForImages: true,
          waitingForViewTransition: false,
          unsuspend: noop$1
        }, appearingViewTransitions = null, accumulateSuspenseyCommitOnFiber(
          finishedWork,
          lanes,
          suspendedCommitReason
        ), isViewTransitionEligible && (subtreeFlags = suspendedCommitReason, isViewTransitionEligible = root2.containerInfo, isViewTransitionEligible = (9 === isViewTransitionEligible.nodeType ? isViewTransitionEligible : isViewTransitionEligible.ownerDocument).__reactViewTransition, null != isViewTransitionEligible && (subtreeFlags.count++, subtreeFlags.waitingForViewTransition = true, subtreeFlags = onUnsuspend.bind(subtreeFlags), isViewTransitionEligible.finished.then(subtreeFlags, subtreeFlags))), subtreeFlags = (lanes & 62914560) === lanes ? globalMostRecentFallbackTime - now3() : (lanes & 4194048) === lanes ? globalMostRecentTransitionTime - now3() : 0, subtreeFlags = waitForCommitToBeReady(
          suspendedCommitReason,
          subtreeFlags
        ), null !== subtreeFlags) {
          pendingEffectsLanes = lanes;
          root2.cancelPendingCommit = subtreeFlags(
            completeRoot.bind(
              null,
              root2,
              finishedWork,
              lanes,
              recoverableErrors,
              transitions,
              didIncludeRenderPhaseUpdate,
              spawnedLane,
              updatedLanes,
              suspendedRetryLanes,
              didSkipSuspendedSiblings,
              exitStatus,
              suspendedCommitReason,
              null,
              completedRenderStartTime,
              completedRenderEndTime
            )
          );
          markRootSuspended(root2, lanes, spawnedLane, !didSkipSuspendedSiblings);
          return;
        }
      }
      completeRoot(
        root2,
        finishedWork,
        lanes,
        recoverableErrors,
        transitions,
        didIncludeRenderPhaseUpdate,
        spawnedLane,
        updatedLanes,
        suspendedRetryLanes,
        didSkipSuspendedSiblings,
        exitStatus,
        suspendedCommitReason
      );
    }
    function isRenderConsistentWithExternalStores(finishedWork) {
      for (var node = finishedWork; ; ) {
        var tag = node.tag;
        if ((0 === tag || 11 === tag || 15 === tag) && node.flags & 16384 && (tag = node.updateQueue, null !== tag && (tag = tag.stores, null !== tag)))
          for (var i = 0; i < tag.length; i++) {
            var check = tag[i], getSnapshot = check.getSnapshot;
            check = check.value;
            try {
              if (!objectIs(getSnapshot(), check)) return false;
            } catch (error) {
              return false;
            }
          }
        tag = node.child;
        if (node.subtreeFlags & 16384 && null !== tag)
          tag.return = node, node = tag;
        else {
          if (node === finishedWork) break;
          for (; null === node.sibling; ) {
            if (null === node.return || node.return === finishedWork) return true;
            node = node.return;
          }
          node.sibling.return = node.return;
          node = node.sibling;
        }
      }
      return true;
    }
    function markRootSuspended(root2, suspendedLanes, spawnedLane, didAttemptEntireTree) {
      suspendedLanes = getEntangledLanes(root2, suspendedLanes);
      suspendedLanes &= ~workInProgressRootPingedLanes;
      suspendedLanes &= ~workInProgressRootInterleavedUpdatedLanes;
      root2.suspendedLanes |= suspendedLanes;
      root2.pingedLanes &= ~suspendedLanes;
      didAttemptEntireTree && (root2.warmLanes |= suspendedLanes);
      didAttemptEntireTree = root2.expirationTimes;
      for (var lanes = suspendedLanes; 0 < lanes; ) {
        var index$6 = 31 - clz32(lanes), lane = 1 << index$6;
        didAttemptEntireTree[index$6] = -1;
        lanes &= ~lane;
      }
      0 !== spawnedLane && markSpawnedDeferredLane(root2, spawnedLane, suspendedLanes);
    }
    function flushSyncWork$1() {
      return 0 === (executionContext & 6) ? (flushSyncWorkAcrossRoots_impl(0, false), false) : true;
    }
    function resetWorkInProgressStack() {
      if (null !== workInProgress) {
        if (0 === workInProgressSuspendedReason)
          var interruptedWork = workInProgress.return;
        else
          interruptedWork = workInProgress, lastContextDependency = currentlyRenderingFiber$1 = null, resetHooksOnUnwind(interruptedWork), thenableState$1 = null, thenableIndexCounter$1 = 0, interruptedWork = workInProgress;
        for (; null !== interruptedWork; )
          unwindInterruptedWork(interruptedWork.alternate, interruptedWork), interruptedWork = interruptedWork.return;
        workInProgress = null;
      }
    }
    function prepareFreshStack(root2, lanes) {
      var timeoutHandle = root2.timeoutHandle;
      -1 !== timeoutHandle && (root2.timeoutHandle = -1, cancelTimeout(timeoutHandle));
      timeoutHandle = root2.cancelPendingCommit;
      null !== timeoutHandle && (root2.cancelPendingCommit = null, timeoutHandle());
      pendingEffectsLanes = 0;
      resetWorkInProgressStack();
      workInProgressRoot = root2;
      workInProgress = timeoutHandle = createWorkInProgress(root2.current, null);
      workInProgressRootRenderLanes = lanes;
      workInProgressSuspendedReason = 0;
      workInProgressThrownValue = null;
      workInProgressRootDidSkipSuspendedSiblings = false;
      workInProgressRootIsPrerendering = checkIfRootIsPrerendering(root2, lanes);
      workInProgressRootDidAttachPingListener = false;
      workInProgressSuspendedRetryLanes = workInProgressDeferredLane = workInProgressRootPingedLanes = workInProgressRootInterleavedUpdatedLanes = workInProgressRootSkippedLanes = workInProgressRootExitStatus = 0;
      workInProgressRootRecoverableErrors = workInProgressRootConcurrentErrors = null;
      workInProgressRootDidIncludeRecursiveRenderUpdate = false;
      entangledRenderLanes = getEntangledLanes(root2, lanes);
      finishQueueingConcurrentUpdates();
      return timeoutHandle;
    }
    function handleThrow(root2, thrownValue) {
      currentlyRenderingFiber = null;
      ReactSharedInternals.H = ContextOnlyDispatcher;
      thrownValue === SuspenseException || thrownValue === SuspenseActionException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 3) : thrownValue === SuspenseyCommitException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 4) : workInProgressSuspendedReason = thrownValue === SelectiveHydrationException ? 8 : null !== thrownValue && "object" === typeof thrownValue && "function" === typeof thrownValue.then ? 6 : 1;
      workInProgressThrownValue = thrownValue;
      null === workInProgress && (workInProgressRootExitStatus = 1, logUncaughtError(
        root2,
        createCapturedValueAtFiber(thrownValue, root2.current)
      ));
    }
    function shouldRemainOnPreviousScreen() {
      var handler = suspenseHandlerStackCursor.current;
      return null === handler ? true : (workInProgressRootRenderLanes & 4194048) === workInProgressRootRenderLanes ? null === shellBoundary ? true : false : (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes || 0 !== (workInProgressRootRenderLanes & 536870912) ? handler === shellBoundary : false;
    }
    function pushDispatcher() {
      var prevDispatcher = ReactSharedInternals.H;
      ReactSharedInternals.H = ContextOnlyDispatcher;
      return null === prevDispatcher ? ContextOnlyDispatcher : prevDispatcher;
    }
    function pushAsyncDispatcher() {
      var prevAsyncDispatcher = ReactSharedInternals.A;
      ReactSharedInternals.A = DefaultAsyncDispatcher;
      return prevAsyncDispatcher;
    }
    function renderDidSuspendDelayIfPossible() {
      workInProgressRootExitStatus = 4;
      workInProgressRootDidSkipSuspendedSiblings || (workInProgressRootRenderLanes & 4194048) !== workInProgressRootRenderLanes && null !== suspenseHandlerStackCursor.current || (workInProgressRootIsPrerendering = true);
      0 === (workInProgressRootSkippedLanes & 134217727) && 0 === (workInProgressRootInterleavedUpdatedLanes & 134217727) || null === workInProgressRoot || markRootSuspended(
        workInProgressRoot,
        workInProgressRootRenderLanes,
        workInProgressDeferredLane,
        false
      );
    }
    function renderRootSync(root2, lanes, shouldYieldForPrerendering) {
      var prevExecutionContext = executionContext;
      executionContext |= 2;
      var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
      if (workInProgressRoot !== root2 || workInProgressRootRenderLanes !== lanes)
        workInProgressTransitions = null, prepareFreshStack(root2, lanes);
      lanes = false;
      var exitStatus = workInProgressRootExitStatus;
      a: do
        try {
          if (0 !== workInProgressSuspendedReason && null !== workInProgress) {
            var unitOfWork = workInProgress, thrownValue = workInProgressThrownValue;
            switch (workInProgressSuspendedReason) {
              case 8:
                resetWorkInProgressStack();
                exitStatus = 6;
                break a;
              case 3:
              case 2:
              case 9:
              case 6:
                null === suspenseHandlerStackCursor.current && (lanes = true);
                var reason = workInProgressSuspendedReason;
                workInProgressSuspendedReason = 0;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, reason);
                if (shouldYieldForPrerendering && workInProgressRootIsPrerendering) {
                  exitStatus = 0;
                  break a;
                }
                break;
              default:
                reason = workInProgressSuspendedReason, workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, reason);
            }
          }
          workLoopSync();
          exitStatus = workInProgressRootExitStatus;
          break;
        } catch (thrownValue$184) {
          handleThrow(root2, thrownValue$184);
        }
      while (1);
      lanes && root2.shellSuspendCounter++;
      lastContextDependency = currentlyRenderingFiber$1 = null;
      executionContext = prevExecutionContext;
      ReactSharedInternals.H = prevDispatcher;
      ReactSharedInternals.A = prevAsyncDispatcher;
      null === workInProgress && (workInProgressRoot = null, workInProgressRootRenderLanes = 0, finishQueueingConcurrentUpdates());
      return exitStatus;
    }
    function workLoopSync() {
      for (; null !== workInProgress; ) performUnitOfWork(workInProgress);
    }
    function renderRootConcurrent(root2, lanes) {
      var prevExecutionContext = executionContext;
      executionContext |= 2;
      var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
      workInProgressRoot !== root2 || workInProgressRootRenderLanes !== lanes ? (workInProgressTransitions = null, workInProgressRootRenderTargetTime = now3() + 500, prepareFreshStack(root2, lanes)) : workInProgressRootIsPrerendering = checkIfRootIsPrerendering(
        root2,
        lanes
      );
      a: do
        try {
          if (0 !== workInProgressSuspendedReason && null !== workInProgress) {
            lanes = workInProgress;
            var thrownValue = workInProgressThrownValue;
            b: switch (workInProgressSuspendedReason) {
              case 1:
                workInProgressSuspendedReason = 0;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(root2, lanes, thrownValue, 1);
                break;
              case 2:
              case 9:
                if (isThenableResolved(thrownValue)) {
                  workInProgressSuspendedReason = 0;
                  workInProgressThrownValue = null;
                  replaySuspendedUnitOfWork(lanes);
                  break;
                }
                lanes = function() {
                  2 !== workInProgressSuspendedReason && 9 !== workInProgressSuspendedReason || workInProgressRoot !== root2 || (workInProgressSuspendedReason = 7);
                  ensureRootIsScheduled(root2);
                };
                thrownValue.then(lanes, lanes);
                break a;
              case 3:
                workInProgressSuspendedReason = 7;
                break a;
              case 4:
                workInProgressSuspendedReason = 5;
                break a;
              case 7:
                isThenableResolved(thrownValue) ? (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, replaySuspendedUnitOfWork(lanes)) : (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root2, lanes, thrownValue, 7));
                break;
              case 5:
                var resource = null;
                switch (workInProgress.tag) {
                  case 26:
                    resource = workInProgress.memoizedState;
                  case 5:
                  case 27:
                    var hostFiber = workInProgress;
                    if (resource ? preloadResource(resource) : hostFiber.stateNode.complete) {
                      workInProgressSuspendedReason = 0;
                      workInProgressThrownValue = null;
                      var sibling = hostFiber.sibling;
                      if (null !== sibling) workInProgress = sibling;
                      else {
                        var returnFiber = hostFiber.return;
                        null !== returnFiber ? (workInProgress = returnFiber, completeUnitOfWork(returnFiber)) : workInProgress = null;
                      }
                      break b;
                    }
                }
                workInProgressSuspendedReason = 0;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(root2, lanes, thrownValue, 5);
                break;
              case 6:
                workInProgressSuspendedReason = 0;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(root2, lanes, thrownValue, 6);
                break;
              case 8:
                resetWorkInProgressStack();
                workInProgressRootExitStatus = 6;
                break a;
              default:
                throw Error(formatProdErrorMessage(462));
            }
          }
          workLoopConcurrentByScheduler();
          break;
        } catch (thrownValue$186) {
          handleThrow(root2, thrownValue$186);
        }
      while (1);
      lastContextDependency = currentlyRenderingFiber$1 = null;
      ReactSharedInternals.H = prevDispatcher;
      ReactSharedInternals.A = prevAsyncDispatcher;
      executionContext = prevExecutionContext;
      if (null !== workInProgress) return 0;
      workInProgressRoot = null;
      workInProgressRootRenderLanes = 0;
      finishQueueingConcurrentUpdates();
      return workInProgressRootExitStatus;
    }
    function workLoopConcurrentByScheduler() {
      for (; null !== workInProgress && !shouldYield(); )
        performUnitOfWork(workInProgress);
    }
    function performUnitOfWork(unitOfWork) {
      var next = beginWork(unitOfWork.alternate, unitOfWork, entangledRenderLanes);
      unitOfWork.memoizedProps = unitOfWork.pendingProps;
      null === next ? completeUnitOfWork(unitOfWork) : workInProgress = next;
    }
    function replaySuspendedUnitOfWork(unitOfWork) {
      var next = unitOfWork;
      var current2 = next.alternate;
      switch (next.tag) {
        case 15:
        case 0:
          next = replayFunctionComponent(
            current2,
            next,
            next.pendingProps,
            next.type,
            void 0,
            workInProgressRootRenderLanes
          );
          break;
        case 11:
          next = replayFunctionComponent(
            current2,
            next,
            next.pendingProps,
            next.type.render,
            next.ref,
            workInProgressRootRenderLanes
          );
          break;
        case 5:
          resetHooksOnUnwind(next);
          var fiber = next;
          fiber === hydrationParentFiber && (isHydrating ? (popToNextHostParent(fiber), 5 === fiber.tag && null != fiber.stateNode && (nextHydratableInstance = fiber.stateNode)) : (popToNextHostParent(fiber), isHydrating = true));
        default:
          unwindInterruptedWork(current2, next), next = workInProgress = resetWorkInProgress(next, entangledRenderLanes), next = beginWork(current2, next, entangledRenderLanes);
      }
      unitOfWork.memoizedProps = unitOfWork.pendingProps;
      null === next ? completeUnitOfWork(unitOfWork) : workInProgress = next;
    }
    function throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, suspendedReason) {
      lastContextDependency = currentlyRenderingFiber$1 = null;
      resetHooksOnUnwind(unitOfWork);
      thenableState$1 = null;
      thenableIndexCounter$1 = 0;
      var returnFiber = unitOfWork.return;
      try {
        if (throwException(
          root2,
          returnFiber,
          unitOfWork,
          thrownValue,
          workInProgressRootRenderLanes
        )) {
          workInProgressRootExitStatus = 1;
          logUncaughtError(
            root2,
            createCapturedValueAtFiber(thrownValue, root2.current)
          );
          workInProgress = null;
          return;
        }
      } catch (error) {
        if (null !== returnFiber) throw workInProgress = returnFiber, error;
        workInProgressRootExitStatus = 1;
        logUncaughtError(
          root2,
          createCapturedValueAtFiber(thrownValue, root2.current)
        );
        workInProgress = null;
        return;
      }
      if (unitOfWork.flags & 32768) {
        if (isHydrating || 1 === suspendedReason) root2 = true;
        else if (workInProgressRootIsPrerendering || 0 !== (workInProgressRootRenderLanes & 536870912))
          root2 = false;
        else if (workInProgressRootDidSkipSuspendedSiblings = root2 = true, 2 === suspendedReason || 9 === suspendedReason || 3 === suspendedReason || 6 === suspendedReason)
          suspendedReason = suspenseHandlerStackCursor.current, null !== suspendedReason && 13 === suspendedReason.tag && (suspendedReason.flags |= 16384);
        unwindUnitOfWork(unitOfWork, root2);
      } else completeUnitOfWork(unitOfWork);
    }
    function completeUnitOfWork(unitOfWork) {
      var completedWork = unitOfWork;
      do {
        if (0 !== (completedWork.flags & 32768)) {
          unwindUnitOfWork(
            completedWork,
            workInProgressRootDidSkipSuspendedSiblings
          );
          return;
        }
        unitOfWork = completedWork.return;
        var next = completeWork(
          completedWork.alternate,
          completedWork,
          entangledRenderLanes
        );
        if (null !== next) {
          workInProgress = next;
          return;
        }
        completedWork = completedWork.sibling;
        if (null !== completedWork) {
          workInProgress = completedWork;
          return;
        }
        workInProgress = completedWork = unitOfWork;
      } while (null !== completedWork);
      0 === workInProgressRootExitStatus && (workInProgressRootExitStatus = 5);
    }
    function unwindUnitOfWork(unitOfWork, skipSiblings) {
      do {
        var next = unwindWork(unitOfWork.alternate, unitOfWork);
        if (null !== next) {
          next.flags &= 32767;
          workInProgress = next;
          return;
        }
        next = unitOfWork.return;
        null !== next && (next.flags |= 32768, next.subtreeFlags = 0, next.deletions = null);
        if (!skipSiblings && (unitOfWork = unitOfWork.sibling, null !== unitOfWork)) {
          workInProgress = unitOfWork;
          return;
        }
        workInProgress = unitOfWork = next;
      } while (null !== unitOfWork);
      workInProgressRootExitStatus = 6;
      workInProgress = null;
    }
    function completeRoot(root2, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes, didSkipSuspendedSiblings, exitStatus, suspendedState) {
      root2.cancelPendingCommit = null;
      do
        flushPendingEffects();
      while (0 !== pendingEffectsStatus);
      if (0 !== (executionContext & 6)) throw Error(formatProdErrorMessage(327));
      if (null !== finishedWork) {
        if (finishedWork === root2.current) throw Error(formatProdErrorMessage(177));
        root2 === workInProgressRoot && (workInProgress = workInProgressRoot = null, workInProgressRootRenderLanes = 0);
        pendingFinishedWork = finishedWork;
        pendingEffectsRoot = root2;
        pendingEffectsLanes = lanes;
        pendingPassiveTransitions = transitions;
        pendingRecoverableErrors = recoverableErrors;
        commitRoot(
          root2,
          finishedWork,
          lanes,
          spawnedLane,
          updatedLanes,
          suspendedRetryLanes,
          suspendedState
        );
      }
    }
    function commitRoot(root2, finishedWork, lanes, spawnedLane, updatedLanes, suspendedRetryLanes, suspendedState) {
      var remainingLanes = finishedWork.lanes | finishedWork.childLanes;
      pendingEffectsRemainingLanes = remainingLanes;
      remainingLanes |= concurrentlyUpdatedLanes;
      markRootFinished(
        root2,
        lanes,
        remainingLanes,
        spawnedLane,
        updatedLanes,
        suspendedRetryLanes
      );
      pendingViewTransitionEvents = null;
      (lanes & 335544064) === lanes ? (pendingTransitionTypes = claimQueuedTransitionTypes(root2), spawnedLane = 10262) : (pendingTransitionTypes = null, spawnedLane = 10256);
      0 !== (finishedWork.subtreeFlags & spawnedLane) || 0 !== (finishedWork.flags & spawnedLane) ? (root2.callbackNode = null, root2.callbackPriority = 0, scheduleCallback$1(NormalPriority$1, function() {
        flushPassiveEffects();
        return null;
      })) : (root2.callbackNode = null, root2.callbackPriority = 0);
      shouldStartViewTransition = false;
      spawnedLane = 0 !== (finishedWork.flags & 13878);
      if (0 !== (finishedWork.subtreeFlags & 13878) || spawnedLane) {
        spawnedLane = ReactSharedInternals.T;
        ReactSharedInternals.T = null;
        updatedLanes = ReactDOMSharedInternals.p;
        ReactDOMSharedInternals.p = 2;
        suspendedRetryLanes = executionContext;
        executionContext |= 4;
        try {
          commitBeforeMutationEffects(root2, finishedWork, lanes);
        } finally {
          executionContext = suspendedRetryLanes, ReactDOMSharedInternals.p = updatedLanes, ReactSharedInternals.T = spawnedLane;
        }
      }
      pendingEffectsStatus = 1;
      shouldStartViewTransition ? pendingViewTransition = startViewTransition(
        suspendedState,
        root2.containerInfo,
        pendingTransitionTypes,
        flushMutationEffects,
        flushLayoutEffects,
        flushAfterMutationEffects,
        flushSpawnedWork,
        flushPassiveEffects,
        reportViewTransitionError,
        null,
        null
      ) : (flushMutationEffects(), flushLayoutEffects(), flushSpawnedWork());
    }
    function reportViewTransitionError(error) {
      if (0 !== pendingEffectsStatus) {
        var onRecoverableError = pendingEffectsRoot.onRecoverableError;
        onRecoverableError(error, { componentStack: null });
      }
    }
    function flushAfterMutationEffects() {
      3 === pendingEffectsStatus && (pendingEffectsStatus = 0, commitAfterMutationEffectsOnFiber(pendingFinishedWork, pendingEffectsRoot), pendingEffectsStatus = 4);
    }
    function flushMutationEffects() {
      if (1 === pendingEffectsStatus) {
        pendingEffectsStatus = 0;
        var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, lanes = pendingEffectsLanes, rootMutationHasEffect = 0 !== (finishedWork.flags & 13878);
        if (0 !== (finishedWork.subtreeFlags & 13878) || rootMutationHasEffect) {
          rootMutationHasEffect = ReactSharedInternals.T;
          ReactSharedInternals.T = null;
          var previousPriority = ReactDOMSharedInternals.p;
          ReactDOMSharedInternals.p = 2;
          var prevExecutionContext = executionContext;
          executionContext |= 4;
          try {
            inUpdateViewTransition = rootViewTransitionAffected = false;
            commitMutationEffectsOnFiber(finishedWork, root2, lanes);
            lanes = selectionInformation;
            var curFocusedElem = getActiveElementDeep(root2.containerInfo), priorFocusedElem = lanes.focusedElem, priorSelectionRange = lanes.selectionRange;
            if (curFocusedElem !== priorFocusedElem && priorFocusedElem && priorFocusedElem.ownerDocument && containsNode(
              priorFocusedElem.ownerDocument.documentElement,
              priorFocusedElem
            )) {
              if (null !== priorSelectionRange && hasSelectionCapabilities(priorFocusedElem)) {
                var start = priorSelectionRange.start, end = priorSelectionRange.end;
                void 0 === end && (end = start);
                if ("selectionStart" in priorFocusedElem)
                  priorFocusedElem.selectionStart = start, priorFocusedElem.selectionEnd = Math.min(
                    end,
                    priorFocusedElem.value.length
                  );
                else {
                  var doc = priorFocusedElem.ownerDocument || document, win2 = doc && doc.defaultView || window;
                  if (win2.getSelection) {
                    var selection = win2.getSelection(), length = priorFocusedElem.textContent.length, start$jscomp$0 = Math.min(priorSelectionRange.start, length), end$jscomp$0 = void 0 === priorSelectionRange.end ? start$jscomp$0 : Math.min(priorSelectionRange.end, length);
                    !selection.extend && start$jscomp$0 > end$jscomp$0 && (curFocusedElem = end$jscomp$0, end$jscomp$0 = start$jscomp$0, start$jscomp$0 = curFocusedElem);
                    var startMarker = getNodeForCharacterOffset(
                      priorFocusedElem,
                      start$jscomp$0
                    ), endMarker = getNodeForCharacterOffset(
                      priorFocusedElem,
                      end$jscomp$0
                    );
                    if (startMarker && endMarker && (1 !== selection.rangeCount || selection.anchorNode !== startMarker.node || selection.anchorOffset !== startMarker.offset || selection.focusNode !== endMarker.node || selection.focusOffset !== endMarker.offset)) {
                      var range = doc.createRange();
                      range.setStart(startMarker.node, startMarker.offset);
                      selection.removeAllRanges();
                      start$jscomp$0 > end$jscomp$0 ? (selection.addRange(range), selection.extend(endMarker.node, endMarker.offset)) : (range.setEnd(endMarker.node, endMarker.offset), selection.addRange(range));
                    }
                  }
                }
              }
              doc = [];
              for (selection = priorFocusedElem; selection = selection.parentNode; )
                1 === selection.nodeType && doc.push({
                  element: selection,
                  left: selection.scrollLeft,
                  top: selection.scrollTop
                });
              "function" === typeof priorFocusedElem.focus && priorFocusedElem.focus();
              for (priorFocusedElem = 0; priorFocusedElem < doc.length; priorFocusedElem++) {
                var info = doc[priorFocusedElem];
                info.element.scrollLeft = info.left;
                info.element.scrollTop = info.top;
              }
            }
            _enabled = !!eventsEnabled;
            selectionInformation = eventsEnabled = null;
          } finally {
            executionContext = prevExecutionContext, ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = rootMutationHasEffect;
          }
        }
        root2.current = finishedWork;
        pendingEffectsStatus = 2;
      }
    }
    function flushLayoutEffects() {
      if (2 === pendingEffectsStatus) {
        pendingEffectsStatus = 0;
        var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, rootHasLayoutEffect = 0 !== (finishedWork.flags & 8772);
        if (0 !== (finishedWork.subtreeFlags & 8772) || rootHasLayoutEffect) {
          rootHasLayoutEffect = ReactSharedInternals.T;
          ReactSharedInternals.T = null;
          var previousPriority = ReactDOMSharedInternals.p;
          ReactDOMSharedInternals.p = 2;
          var prevExecutionContext = executionContext;
          executionContext |= 4;
          try {
            commitLayoutEffectOnFiber(root2, finishedWork.alternate, finishedWork);
          } finally {
            executionContext = prevExecutionContext, ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = rootHasLayoutEffect;
          }
        }
        pendingEffectsStatus = 3;
      }
    }
    function flushSpawnedWork() {
      if (4 === pendingEffectsStatus || 3 === pendingEffectsStatus) {
        pendingEffectsStatus = 0;
        var committedViewTransition = pendingViewTransition;
        pendingViewTransition = null;
        requestPaint();
        var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, lanes = pendingEffectsLanes, recoverableErrors = pendingRecoverableErrors, passiveSubtreeMask = (lanes & 335544064) === lanes ? 10262 : 10256;
        0 !== (finishedWork.subtreeFlags & passiveSubtreeMask) || 0 !== (finishedWork.flags & passiveSubtreeMask) ? pendingEffectsStatus = 5 : (pendingEffectsStatus = 0, pendingFinishedWork = pendingEffectsRoot = null, releaseRootPooledCache(root2, root2.pendingLanes));
        passiveSubtreeMask = root2.pendingLanes;
        0 === passiveSubtreeMask && (legacyErrorBoundariesThatAlreadyFailed = null);
        lanesToEventPriority(lanes);
        finishedWork = finishedWork.stateNode;
        if (injectedHook && "function" === typeof injectedHook.onCommitFiberRoot)
          try {
            injectedHook.onCommitFiberRoot(
              rendererID,
              finishedWork,
              void 0,
              128 === (finishedWork.current.flags & 128)
            );
          } catch (err) {
          }
        if (null !== recoverableErrors) {
          finishedWork = ReactSharedInternals.T;
          passiveSubtreeMask = ReactDOMSharedInternals.p;
          ReactDOMSharedInternals.p = 2;
          ReactSharedInternals.T = null;
          try {
            for (var onRecoverableError = root2.onRecoverableError, i = 0; i < recoverableErrors.length; i++) {
              var recoverableError = recoverableErrors[i];
              onRecoverableError(recoverableError.value, {
                componentStack: recoverableError.stack
              });
            }
          } finally {
            ReactSharedInternals.T = finishedWork, ReactDOMSharedInternals.p = passiveSubtreeMask;
          }
        }
        recoverableErrors = pendingViewTransitionEvents;
        onRecoverableError = pendingTransitionTypes;
        pendingTransitionTypes = null;
        if (null !== recoverableErrors && (pendingViewTransitionEvents = null, null === onRecoverableError && (onRecoverableError = []), null !== committedViewTransition))
          for (recoverableError = 0; recoverableError < recoverableErrors.length; recoverableError++)
            finishedWork = (0, recoverableErrors[recoverableError])(
              onRecoverableError
            ), void 0 !== finishedWork && committedViewTransition.finished.finally(finishedWork);
        0 !== (pendingEffectsLanes & 3) && flushPendingEffects();
        ensureRootIsScheduled(root2);
        passiveSubtreeMask = root2.pendingLanes;
        0 !== (lanes & 261930) && 0 !== (passiveSubtreeMask & 42) ? root2 === rootWithNestedUpdates ? nestedUpdateCount++ : (nestedUpdateCount = 0, rootWithNestedUpdates = root2) : (nestedUpdateCount = 0, rootWithNestedUpdates = null);
        flushSyncWorkAcrossRoots_impl(0, false);
      }
    }
    function releaseRootPooledCache(root2, remainingLanes) {
      0 === (root2.pooledCacheLanes &= remainingLanes) && (remainingLanes = root2.pooledCache, null != remainingLanes && (root2.pooledCache = null, releaseCache(remainingLanes)));
    }
    function flushPendingEffects() {
      null !== pendingViewTransition && (pendingViewTransition.skipTransition(), pendingViewTransition = null);
      flushMutationEffects();
      flushLayoutEffects();
      flushSpawnedWork();
      return flushPassiveEffects();
    }
    function flushPassiveEffects() {
      if (5 !== pendingEffectsStatus) return false;
      var root2 = pendingEffectsRoot, remainingLanes = pendingEffectsRemainingLanes;
      pendingEffectsRemainingLanes = 0;
      var renderPriority = lanesToEventPriority(pendingEffectsLanes), prevTransition = ReactSharedInternals.T, previousPriority = ReactDOMSharedInternals.p;
      try {
        ReactDOMSharedInternals.p = 32 > renderPriority ? 32 : renderPriority;
        ReactSharedInternals.T = null;
        renderPriority = pendingPassiveTransitions;
        pendingPassiveTransitions = null;
        var root$jscomp$0 = pendingEffectsRoot, lanes = pendingEffectsLanes;
        pendingEffectsStatus = 0;
        pendingFinishedWork = pendingEffectsRoot = null;
        pendingEffectsLanes = 0;
        if (0 !== (executionContext & 6)) throw Error(formatProdErrorMessage(331));
        var prevExecutionContext = executionContext;
        executionContext |= 4;
        commitPassiveUnmountOnFiber(root$jscomp$0.current);
        commitPassiveMountOnFiber(
          root$jscomp$0,
          root$jscomp$0.current,
          lanes,
          renderPriority
        );
        executionContext = prevExecutionContext;
        flushSyncWorkAcrossRoots_impl(0, false);
        if (injectedHook && "function" === typeof injectedHook.onPostCommitFiberRoot)
          try {
            injectedHook.onPostCommitFiberRoot(rendererID, root$jscomp$0);
          } catch (err) {
          }
        return true;
      } finally {
        ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition, releaseRootPooledCache(root2, remainingLanes);
      }
    }
    function captureCommitPhaseErrorOnRoot(rootFiber, sourceFiber, error) {
      sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
      sourceFiber = createRootErrorUpdate(rootFiber.stateNode, sourceFiber, 2);
      rootFiber = enqueueUpdate(rootFiber, sourceFiber, 2);
      null !== rootFiber && (markRootUpdated$1(rootFiber, 2), ensureRootIsScheduled(rootFiber));
    }
    function captureCommitPhaseError(sourceFiber, nearestMountedAncestor, error) {
      if (3 === sourceFiber.tag)
        captureCommitPhaseErrorOnRoot(sourceFiber, sourceFiber, error);
      else
        for (; null !== nearestMountedAncestor; ) {
          if (3 === nearestMountedAncestor.tag) {
            captureCommitPhaseErrorOnRoot(
              nearestMountedAncestor,
              sourceFiber,
              error
            );
            break;
          } else if (1 === nearestMountedAncestor.tag) {
            var instance = nearestMountedAncestor.stateNode;
            if ("function" === typeof nearestMountedAncestor.type.getDerivedStateFromError || "function" === typeof instance.componentDidCatch && (null === legacyErrorBoundariesThatAlreadyFailed || !legacyErrorBoundariesThatAlreadyFailed.has(instance))) {
              sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
              error = createClassErrorUpdate(2);
              instance = enqueueUpdate(nearestMountedAncestor, error, 2);
              null !== instance && (initializeClassErrorUpdate(
                error,
                instance,
                nearestMountedAncestor,
                sourceFiber
              ), markRootUpdated$1(instance, 2), ensureRootIsScheduled(instance));
              break;
            }
          }
          nearestMountedAncestor = nearestMountedAncestor.return;
        }
    }
    function attachPingListener(root2, wakeable, lanes) {
      var pingCache = root2.pingCache;
      if (null === pingCache) {
        pingCache = root2.pingCache = new PossiblyWeakMap();
        var threadIDs = /* @__PURE__ */ new Set();
        pingCache.set(wakeable, threadIDs);
      } else
        threadIDs = pingCache.get(wakeable), void 0 === threadIDs && (threadIDs = /* @__PURE__ */ new Set(), pingCache.set(wakeable, threadIDs));
      threadIDs.has(lanes) || (workInProgressRootDidAttachPingListener = true, threadIDs.add(lanes), root2 = pingSuspendedRoot.bind(null, root2, wakeable, lanes), wakeable.then(root2, root2));
    }
    function pingSuspendedRoot(root2, wakeable, pingedLanes) {
      var pingCache = root2.pingCache;
      null !== pingCache && pingCache.delete(wakeable);
      root2.pingedLanes |= root2.suspendedLanes & pingedLanes;
      root2.warmLanes &= ~pingedLanes;
      workInProgressRoot === root2 && (workInProgressRootRenderLanes & pingedLanes) === pingedLanes && (4 === workInProgressRootExitStatus || 3 === workInProgressRootExitStatus && (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes && 300 > now3() - globalMostRecentFallbackTime ? 0 === (executionContext & 2) ? prepareFreshStack(root2, 0) : workInProgressRootPingedLanes |= pingedLanes : workInProgressRootPingedLanes |= pingedLanes, workInProgressSuspendedRetryLanes === workInProgressRootRenderLanes && (workInProgressSuspendedRetryLanes = 0));
      ensureRootIsScheduled(root2);
    }
    function retryTimedOutBoundary(boundaryFiber, retryLane) {
      0 === retryLane && (retryLane = claimNextRetryLane());
      boundaryFiber = enqueueConcurrentRenderForLane(boundaryFiber, retryLane);
      null !== boundaryFiber && (markRootUpdated$1(boundaryFiber, retryLane), ensureRootIsScheduled(boundaryFiber));
    }
    function retryDehydratedSuspenseBoundary(boundaryFiber) {
      var suspenseState = boundaryFiber.memoizedState, retryLane = 0;
      null !== suspenseState && (retryLane = suspenseState.retryLane);
      retryTimedOutBoundary(boundaryFiber, retryLane);
    }
    function resolveRetryWakeable(boundaryFiber, wakeable) {
      var retryLane = 0;
      switch (boundaryFiber.tag) {
        case 31:
        case 13:
          var retryCache = boundaryFiber.stateNode;
          var suspenseState = boundaryFiber.memoizedState;
          null !== suspenseState && (retryLane = suspenseState.retryLane);
          break;
        case 19:
          retryCache = boundaryFiber.stateNode;
          break;
        case 22:
          retryCache = boundaryFiber.stateNode._retryCache;
          break;
        default:
          throw Error(formatProdErrorMessage(314));
      }
      null !== retryCache && retryCache.delete(wakeable);
      retryTimedOutBoundary(boundaryFiber, retryLane);
    }
    function scheduleCallback$1(priorityLevel, callback) {
      return scheduleCallback$3(priorityLevel, callback);
    }
    var firstScheduledRoot = null;
    var lastScheduledRoot = null;
    var didScheduleMicrotask = false;
    var mightHavePendingSyncWork = false;
    var isFlushingWork = false;
    var currentEventTransitionLane = 0;
    function ensureRootIsScheduled(root2) {
      root2 !== lastScheduledRoot && null === root2.next && (null === lastScheduledRoot ? firstScheduledRoot = lastScheduledRoot = root2 : lastScheduledRoot = lastScheduledRoot.next = root2);
      mightHavePendingSyncWork = true;
      didScheduleMicrotask || (didScheduleMicrotask = true, scheduleImmediateRootScheduleTask());
    }
    function flushSyncWorkAcrossRoots_impl(syncTransitionLanes, onlyLegacy) {
      if (!isFlushingWork && mightHavePendingSyncWork) {
        isFlushingWork = true;
        do {
          var didPerformSomeWork = false;
          for (var root$190 = firstScheduledRoot; null !== root$190; ) {
            if (!onlyLegacy)
              if (0 !== syncTransitionLanes) {
                var pendingLanes = root$190.pendingLanes;
                if (0 === pendingLanes) var JSCompiler_inline_result = 0;
                else {
                  var suspendedLanes = root$190.suspendedLanes, pingedLanes = root$190.pingedLanes;
                  JSCompiler_inline_result = (1 << 31 - clz32(42 | syncTransitionLanes) + 1) - 1;
                  JSCompiler_inline_result &= pendingLanes & ~(suspendedLanes & ~pingedLanes);
                  JSCompiler_inline_result = JSCompiler_inline_result & 201326741 ? JSCompiler_inline_result & 201326741 | 1 : JSCompiler_inline_result ? JSCompiler_inline_result | 2 : 0;
                }
                0 !== JSCompiler_inline_result && (didPerformSomeWork = true, performSyncWorkOnRoot(root$190, JSCompiler_inline_result));
              } else
                JSCompiler_inline_result = workInProgressRootRenderLanes, JSCompiler_inline_result = getNextLanes(
                  root$190,
                  root$190 === workInProgressRoot ? JSCompiler_inline_result : 0,
                  null !== root$190.cancelPendingCommit || -1 !== root$190.timeoutHandle
                ), 0 === (JSCompiler_inline_result & 3) || checkIfRootIsPrerendering(root$190, JSCompiler_inline_result) || (didPerformSomeWork = true, performSyncWorkOnRoot(root$190, JSCompiler_inline_result));
            root$190 = root$190.next;
          }
        } while (didPerformSomeWork);
        isFlushingWork = false;
      }
    }
    function processRootScheduleInImmediateTask() {
      processRootScheduleInMicrotask();
    }
    function processRootScheduleInMicrotask() {
      mightHavePendingSyncWork = didScheduleMicrotask = false;
      var syncTransitionLanes = 0;
      0 !== currentEventTransitionLane && shouldAttemptEagerTransition() && (syncTransitionLanes = currentEventTransitionLane);
      for (var currentTime = now3(), prev = null, root2 = firstScheduledRoot; null !== root2; ) {
        var next = root2.next, nextLanes = scheduleTaskForRootDuringMicrotask(root2, currentTime);
        if (0 === nextLanes)
          root2.next = null, null === prev ? firstScheduledRoot = next : prev.next = next, null === next && (lastScheduledRoot = prev);
        else if (prev = root2, 0 !== syncTransitionLanes || 0 !== (nextLanes & 3))
          mightHavePendingSyncWork = true;
        root2 = next;
      }
      0 !== pendingEffectsStatus && 5 !== pendingEffectsStatus || flushSyncWorkAcrossRoots_impl(syncTransitionLanes, false);
      0 !== currentEventTransitionLane && (currentEventTransitionLane = 0);
    }
    function scheduleTaskForRootDuringMicrotask(root2, currentTime) {
      for (var suspendedLanes = root2.suspendedLanes, pingedLanes = root2.pingedLanes, expirationTimes = root2.expirationTimes, lanes = root2.pendingLanes & -62914561; 0 < lanes; ) {
        var index$5 = 31 - clz32(lanes), lane = 1 << index$5, expirationTime = expirationTimes[index$5];
        if (-1 === expirationTime) {
          if (0 === (lane & suspendedLanes) || 0 !== (lane & pingedLanes))
            expirationTimes[index$5] = computeExpirationTime(lane, currentTime);
        } else expirationTime <= currentTime && (root2.expiredLanes |= lane);
        lanes &= ~lane;
      }
      currentTime = workInProgressRoot;
      suspendedLanes = workInProgressRootRenderLanes;
      suspendedLanes = getNextLanes(
        root2,
        root2 === currentTime ? suspendedLanes : 0,
        null !== root2.cancelPendingCommit || -1 !== root2.timeoutHandle
      );
      pingedLanes = root2.callbackNode;
      if (0 === suspendedLanes || root2 === currentTime && (2 === workInProgressSuspendedReason || 9 === workInProgressSuspendedReason) || null !== root2.cancelPendingCommit)
        return null !== pingedLanes && null !== pingedLanes && cancelCallback$1(pingedLanes), root2.callbackNode = null, root2.callbackPriority = 0;
      if (0 === (suspendedLanes & 3) || checkIfRootIsPrerendering(root2, suspendedLanes)) {
        currentTime = suspendedLanes & -suspendedLanes;
        if (currentTime === root2.callbackPriority) return currentTime;
        null !== pingedLanes && cancelCallback$1(pingedLanes);
        switch (lanesToEventPriority(suspendedLanes)) {
          case 2:
          case 8:
            suspendedLanes = UserBlockingPriority;
            break;
          case 32:
            suspendedLanes = NormalPriority$1;
            break;
          case 268435456:
            suspendedLanes = IdlePriority;
            break;
          default:
            suspendedLanes = NormalPriority$1;
        }
        pingedLanes = performWorkOnRootViaSchedulerTask.bind(null, root2);
        suspendedLanes = scheduleCallback$3(suspendedLanes, pingedLanes);
        root2.callbackPriority = currentTime;
        root2.callbackNode = suspendedLanes;
        return currentTime;
      }
      null !== pingedLanes && null !== pingedLanes && cancelCallback$1(pingedLanes);
      root2.callbackPriority = 2;
      root2.callbackNode = null;
      return 2;
    }
    function performWorkOnRootViaSchedulerTask(root2, didTimeout) {
      if (0 !== pendingEffectsStatus && 5 !== pendingEffectsStatus)
        return root2.callbackNode = null, root2.callbackPriority = 0, null;
      var originalCallbackNode = root2.callbackNode;
      if (flushPendingEffects() && root2.callbackNode !== originalCallbackNode)
        return null;
      var workInProgressRootRenderLanes$jscomp$0 = workInProgressRootRenderLanes;
      workInProgressRootRenderLanes$jscomp$0 = getNextLanes(
        root2,
        root2 === workInProgressRoot ? workInProgressRootRenderLanes$jscomp$0 : 0,
        null !== root2.cancelPendingCommit || -1 !== root2.timeoutHandle
      );
      if (0 === workInProgressRootRenderLanes$jscomp$0) return null;
      performWorkOnRoot(root2, workInProgressRootRenderLanes$jscomp$0, didTimeout);
      scheduleTaskForRootDuringMicrotask(root2, now3());
      return null != root2.callbackNode && root2.callbackNode === originalCallbackNode ? performWorkOnRootViaSchedulerTask.bind(null, root2) : null;
    }
    function performSyncWorkOnRoot(root2, lanes) {
      if (flushPendingEffects()) return null;
      performWorkOnRoot(root2, lanes, true);
    }
    function scheduleImmediateRootScheduleTask() {
      scheduleMicrotask(function() {
        0 !== (executionContext & 6) ? scheduleCallback$3(
          ImmediatePriority,
          processRootScheduleInImmediateTask
        ) : processRootScheduleInMicrotask();
      });
    }
    function requestTransitionLane() {
      if (0 === currentEventTransitionLane) {
        var actionScopeLane = currentEntangledLane;
        0 === actionScopeLane && (actionScopeLane = nextTransitionUpdateLane, nextTransitionUpdateLane <<= 1, 0 === (nextTransitionUpdateLane & 261888) && (nextTransitionUpdateLane = 256));
        currentEventTransitionLane = actionScopeLane;
      }
      return currentEventTransitionLane;
    }
    function coerceFormActionProp(actionProp) {
      return null == actionProp || "symbol" === typeof actionProp || "boolean" === typeof actionProp ? null : "function" === typeof actionProp ? actionProp : sanitizeURL(actionProp);
    }
    function extractEvents$1(dispatchQueue, domEventName, maybeTargetInst, nativeEvent, nativeEventTarget) {
      if ("submit" === domEventName && maybeTargetInst && maybeTargetInst.stateNode === nativeEventTarget) {
        var action = coerceFormActionProp(
          (nativeEventTarget[internalPropsKey] || null).action
        ), submitter = nativeEvent.submitter;
        submitter && (domEventName = (domEventName = submitter[internalPropsKey] || null) ? coerceFormActionProp(domEventName.formAction) : submitter.getAttribute("formAction"), null !== domEventName && (action = domEventName, submitter = null));
        var event = new SyntheticEvent(
          "action",
          "action",
          null,
          nativeEvent,
          nativeEventTarget
        );
        dispatchQueue.push({
          event,
          listeners: [
            {
              instance: null,
              listener: function() {
                if (nativeEvent.defaultPrevented) {
                  if (0 !== currentEventTransitionLane) {
                    var formData = new FormData(nativeEventTarget, submitter);
                    startHostTransition(
                      maybeTargetInst,
                      {
                        pending: true,
                        data: formData,
                        method: nativeEventTarget.method,
                        action
                      },
                      null,
                      formData
                    );
                  }
                } else
                  "function" === typeof action && (event.preventDefault(), formData = new FormData(nativeEventTarget, submitter), startHostTransition(
                    maybeTargetInst,
                    {
                      pending: true,
                      data: formData,
                      method: nativeEventTarget.method,
                      action
                    },
                    action,
                    formData
                  ));
              },
              currentTarget: nativeEventTarget
            }
          ]
        });
      }
    }
    for (i$jscomp$inline_1667 = 0; i$jscomp$inline_1667 < simpleEventPluginEvents.length; i$jscomp$inline_1667++) {
      eventName$jscomp$inline_1668 = simpleEventPluginEvents[i$jscomp$inline_1667], domEventName$jscomp$inline_1669 = eventName$jscomp$inline_1668.toLowerCase(), capitalizedEvent$jscomp$inline_1670 = eventName$jscomp$inline_1668[0].toUpperCase() + eventName$jscomp$inline_1668.slice(1);
      registerSimpleEvent(
        domEventName$jscomp$inline_1669,
        "on" + capitalizedEvent$jscomp$inline_1670
      );
    }
    var eventName$jscomp$inline_1668;
    var domEventName$jscomp$inline_1669;
    var capitalizedEvent$jscomp$inline_1670;
    var i$jscomp$inline_1667;
    registerSimpleEvent(ANIMATION_END, "onAnimationEnd");
    registerSimpleEvent(ANIMATION_ITERATION, "onAnimationIteration");
    registerSimpleEvent(ANIMATION_START, "onAnimationStart");
    registerSimpleEvent("dblclick", "onDoubleClick");
    registerSimpleEvent("focusin", "onFocus");
    registerSimpleEvent("focusout", "onBlur");
    registerSimpleEvent(TRANSITION_RUN, "onTransitionRun");
    registerSimpleEvent(TRANSITION_START, "onTransitionStart");
    registerSimpleEvent(TRANSITION_CANCEL, "onTransitionCancel");
    registerSimpleEvent(TRANSITION_END, "onTransitionEnd");
    registerDirectEvent("onMouseEnter", ["mouseout", "mouseover"]);
    registerDirectEvent("onMouseLeave", ["mouseout", "mouseover"]);
    registerDirectEvent("onPointerEnter", ["pointerout", "pointerover"]);
    registerDirectEvent("onPointerLeave", ["pointerout", "pointerover"]);
    registerTwoPhaseEvent(
      "onChange",
      "change click focusin focusout input keydown keyup selectionchange".split(" ")
    );
    registerTwoPhaseEvent(
      "onSelect",
      "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
        " "
      )
    );
    registerTwoPhaseEvent("onBeforeInput", [
      "compositionend",
      "keypress",
      "textInput",
      "paste"
    ]);
    registerTwoPhaseEvent(
      "onCompositionEnd",
      "compositionend focusout keydown keypress keyup mousedown".split(" ")
    );
    registerTwoPhaseEvent(
      "onCompositionStart",
      "compositionstart focusout keydown keypress keyup mousedown".split(" ")
    );
    registerTwoPhaseEvent(
      "onCompositionUpdate",
      "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
    );
    var mediaEventTypes = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
      " "
    );
    var nonDelegatedEvents = new Set(
      "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(mediaEventTypes)
    );
    function processDispatchQueue(dispatchQueue, eventSystemFlags) {
      eventSystemFlags = 0 !== (eventSystemFlags & 4);
      for (var i = 0; i < dispatchQueue.length; i++) {
        var _dispatchQueue$i = dispatchQueue[i], event = _dispatchQueue$i.event;
        _dispatchQueue$i = _dispatchQueue$i.listeners;
        a: {
          var previousInstance = void 0;
          if (eventSystemFlags)
            for (var i$jscomp$0 = _dispatchQueue$i.length - 1; 0 <= i$jscomp$0; i$jscomp$0--) {
              var _dispatchListeners$i = _dispatchQueue$i[i$jscomp$0], instance = _dispatchListeners$i.instance, currentTarget = _dispatchListeners$i.currentTarget;
              _dispatchListeners$i = _dispatchListeners$i.listener;
              if (instance !== previousInstance && event.isPropagationStopped())
                break a;
              previousInstance = _dispatchListeners$i;
              event.currentTarget = currentTarget;
              try {
                previousInstance(event);
              } catch (error) {
                reportGlobalError(error);
              }
              event.currentTarget = null;
              previousInstance = instance;
            }
          else
            for (i$jscomp$0 = 0; i$jscomp$0 < _dispatchQueue$i.length; i$jscomp$0++) {
              _dispatchListeners$i = _dispatchQueue$i[i$jscomp$0];
              instance = _dispatchListeners$i.instance;
              currentTarget = _dispatchListeners$i.currentTarget;
              _dispatchListeners$i = _dispatchListeners$i.listener;
              if (instance !== previousInstance && event.isPropagationStopped())
                break a;
              previousInstance = _dispatchListeners$i;
              event.currentTarget = currentTarget;
              try {
                previousInstance(event);
              } catch (error) {
                reportGlobalError(error);
              }
              event.currentTarget = null;
              previousInstance = instance;
            }
        }
      }
    }
    function listenToNonDelegatedEvent(domEventName, targetElement) {
      var JSCompiler_inline_result = targetElement[internalEventHandlersKey];
      void 0 === JSCompiler_inline_result && (JSCompiler_inline_result = targetElement[internalEventHandlersKey] = /* @__PURE__ */ new Set());
      var listenerSetKey = domEventName + "__bubble";
      JSCompiler_inline_result.has(listenerSetKey) || (addTrappedEventListener(targetElement, domEventName, 2, false), JSCompiler_inline_result.add(listenerSetKey));
    }
    function listenToNativeEvent(domEventName, isCapturePhaseListener, target) {
      var eventSystemFlags = 0;
      isCapturePhaseListener && (eventSystemFlags |= 4);
      addTrappedEventListener(
        target,
        domEventName,
        eventSystemFlags,
        isCapturePhaseListener
      );
    }
    var listeningMarker = "_reactListening" + Math.random().toString(36).slice(2);
    function listenToAllSupportedEvents(rootContainerElement) {
      if (!rootContainerElement[listeningMarker]) {
        rootContainerElement[listeningMarker] = true;
        allNativeEvents.forEach(function(domEventName) {
          "selectionchange" !== domEventName && (nonDelegatedEvents.has(domEventName) || listenToNativeEvent(domEventName, false, rootContainerElement), listenToNativeEvent(domEventName, true, rootContainerElement));
        });
        var ownerDocument = 9 === rootContainerElement.nodeType ? rootContainerElement : rootContainerElement.ownerDocument;
        null === ownerDocument || ownerDocument[listeningMarker] || (ownerDocument[listeningMarker] = true, listenToNativeEvent("selectionchange", false, ownerDocument));
      }
    }
    function addTrappedEventListener(targetContainer, domEventName, eventSystemFlags, isCapturePhaseListener) {
      switch (getEventPriority(domEventName)) {
        case 2:
          var listenerWrapper = dispatchDiscreteEvent;
          break;
        case 8:
          listenerWrapper = dispatchContinuousEvent;
          break;
        default:
          listenerWrapper = dispatchEvent;
      }
      eventSystemFlags = listenerWrapper.bind(
        null,
        domEventName,
        eventSystemFlags,
        targetContainer
      );
      listenerWrapper = void 0;
      !passiveBrowserEventsSupported || "touchstart" !== domEventName && "touchmove" !== domEventName && "wheel" !== domEventName || (listenerWrapper = true);
      isCapturePhaseListener ? void 0 !== listenerWrapper ? targetContainer.addEventListener(domEventName, eventSystemFlags, {
        capture: true,
        passive: listenerWrapper
      }) : targetContainer.addEventListener(domEventName, eventSystemFlags, true) : void 0 !== listenerWrapper ? targetContainer.addEventListener(domEventName, eventSystemFlags, {
        passive: listenerWrapper
      }) : targetContainer.addEventListener(domEventName, eventSystemFlags, false);
    }
    function dispatchEventForPluginEventSystem(domEventName, eventSystemFlags, nativeEvent, targetInst$jscomp$0, targetContainer) {
      var ancestorInst = targetInst$jscomp$0;
      if (0 === (eventSystemFlags & 1) && 0 === (eventSystemFlags & 2) && null !== targetInst$jscomp$0)
        a: for (; ; ) {
          if (null === targetInst$jscomp$0) return;
          var nodeTag = targetInst$jscomp$0.tag;
          if (3 === nodeTag || 4 === nodeTag) {
            var container = targetInst$jscomp$0.stateNode.containerInfo;
            if (container === targetContainer) break;
            if (4 === nodeTag)
              for (nodeTag = targetInst$jscomp$0.return; null !== nodeTag; ) {
                var grandTag = nodeTag.tag;
                if ((3 === grandTag || 4 === grandTag) && nodeTag.stateNode.containerInfo === targetContainer)
                  return;
                nodeTag = nodeTag.return;
              }
            for (; null !== container; ) {
              nodeTag = getClosestInstanceFromNode(container);
              if (null === nodeTag) return;
              grandTag = nodeTag.tag;
              if (5 === grandTag || 6 === grandTag || 26 === grandTag || 27 === grandTag) {
                targetInst$jscomp$0 = ancestorInst = nodeTag;
                continue a;
              }
              container = container.parentNode;
            }
          }
          targetInst$jscomp$0 = targetInst$jscomp$0.return;
        }
      batchedUpdates$1(function() {
        var targetInst = ancestorInst, nativeEventTarget = getEventTarget(nativeEvent), dispatchQueue = [];
        a: {
          var reactName = topLevelEventsToReactNames.get(domEventName);
          if (void 0 !== reactName) {
            var SyntheticEventCtor = SyntheticEvent, reactEventType = domEventName;
            switch (domEventName) {
              case "keypress":
                if (0 === getEventCharCode(nativeEvent)) break a;
              case "keydown":
              case "keyup":
                SyntheticEventCtor = SyntheticKeyboardEvent;
                break;
              case "focusin":
                reactEventType = "focus";
                SyntheticEventCtor = SyntheticFocusEvent;
                break;
              case "focusout":
                reactEventType = "blur";
                SyntheticEventCtor = SyntheticFocusEvent;
                break;
              case "beforeblur":
              case "afterblur":
                SyntheticEventCtor = SyntheticFocusEvent;
                break;
              case "click":
                if (2 === nativeEvent.button) break a;
              case "auxclick":
              case "dblclick":
              case "mousedown":
              case "mousemove":
              case "mouseup":
              case "mouseout":
              case "mouseover":
              case "contextmenu":
                SyntheticEventCtor = SyntheticMouseEvent;
                break;
              case "drag":
              case "dragend":
              case "dragenter":
              case "dragexit":
              case "dragleave":
              case "dragover":
              case "dragstart":
              case "drop":
                SyntheticEventCtor = SyntheticDragEvent;
                break;
              case "touchcancel":
              case "touchend":
              case "touchmove":
              case "touchstart":
                SyntheticEventCtor = SyntheticTouchEvent;
                break;
              case ANIMATION_END:
              case ANIMATION_ITERATION:
              case ANIMATION_START:
                SyntheticEventCtor = SyntheticAnimationEvent;
                break;
              case TRANSITION_END:
                SyntheticEventCtor = SyntheticTransitionEvent;
                break;
              case "scroll":
              case "scrollend":
                SyntheticEventCtor = SyntheticUIEvent;
                break;
              case "wheel":
                SyntheticEventCtor = SyntheticWheelEvent;
                break;
              case "copy":
              case "cut":
              case "paste":
                SyntheticEventCtor = SyntheticClipboardEvent;
                break;
              case "gotpointercapture":
              case "lostpointercapture":
              case "pointercancel":
              case "pointerdown":
              case "pointermove":
              case "pointerout":
              case "pointerover":
              case "pointerup":
                SyntheticEventCtor = SyntheticPointerEvent;
                break;
              case "submit":
                SyntheticEventCtor = SyntheticSubmitEvent;
                break;
              case "toggle":
              case "beforetoggle":
                SyntheticEventCtor = SyntheticToggleEvent;
            }
            var inCapturePhase = 0 !== (eventSystemFlags & 4), accumulateTargetOnly = !inCapturePhase && ("scroll" === domEventName || "scrollend" === domEventName), reactEventName = inCapturePhase ? null !== reactName ? reactName + "Capture" : null : reactName;
            inCapturePhase = [];
            for (var instance = targetInst, lastHostComponent; null !== instance; ) {
              var _instance = instance;
              lastHostComponent = _instance.stateNode;
              _instance = _instance.tag;
              5 !== _instance && 26 !== _instance && 27 !== _instance || null === lastHostComponent || null === reactEventName || (_instance = getListener(instance, reactEventName), null != _instance && inCapturePhase.push(
                createDispatchListener(instance, _instance, lastHostComponent)
              ));
              if (accumulateTargetOnly) break;
              instance = instance.return;
            }
            0 < inCapturePhase.length && (reactName = new SyntheticEventCtor(
              reactName,
              reactEventType,
              null,
              nativeEvent,
              nativeEventTarget
            ), dispatchQueue.push({ event: reactName, listeners: inCapturePhase }));
          }
        }
        if (0 === (eventSystemFlags & 7)) {
          a: {
            SyntheticEventCtor = "mouseover" === domEventName || "pointerover" === domEventName;
            reactName = "mouseout" === domEventName || "pointerout" === domEventName;
            if (SyntheticEventCtor && nativeEvent !== currentReplayingEvent && (reactEventType = nativeEvent.relatedTarget || nativeEvent.fromElement) && (getClosestInstanceFromNode(reactEventType) || reactEventType[internalContainerInstanceKey]))
              break a;
            if (reactName || SyntheticEventCtor) {
              reactEventType = nativeEventTarget.window === nativeEventTarget ? nativeEventTarget : (SyntheticEventCtor = nativeEventTarget.ownerDocument) ? SyntheticEventCtor.defaultView || SyntheticEventCtor.parentWindow : window;
              if (reactName) {
                if (SyntheticEventCtor = nativeEvent.relatedTarget || nativeEvent.toElement, reactName = targetInst, SyntheticEventCtor = SyntheticEventCtor ? getClosestInstanceFromNode(SyntheticEventCtor) : null, null !== SyntheticEventCtor && (accumulateTargetOnly = getNearestMountedFiber(SyntheticEventCtor), inCapturePhase = SyntheticEventCtor.tag, SyntheticEventCtor !== accumulateTargetOnly || 5 !== inCapturePhase && 27 !== inCapturePhase && 6 !== inCapturePhase))
                  SyntheticEventCtor = null;
              } else reactName = null, SyntheticEventCtor = targetInst;
              if (reactName !== SyntheticEventCtor) {
                inCapturePhase = SyntheticMouseEvent;
                _instance = "onMouseLeave";
                reactEventName = "onMouseEnter";
                instance = "mouse";
                if ("pointerout" === domEventName || "pointerover" === domEventName)
                  inCapturePhase = SyntheticPointerEvent, _instance = "onPointerLeave", reactEventName = "onPointerEnter", instance = "pointer";
                accumulateTargetOnly = null == reactName ? reactEventType : getNodeFromInstance(reactName);
                lastHostComponent = null == SyntheticEventCtor ? reactEventType : getNodeFromInstance(SyntheticEventCtor);
                reactEventType = new inCapturePhase(
                  _instance,
                  instance + "leave",
                  reactName,
                  nativeEvent,
                  nativeEventTarget
                );
                reactEventType.target = accumulateTargetOnly;
                reactEventType.relatedTarget = lastHostComponent;
                _instance = null;
                getClosestInstanceFromNode(nativeEventTarget) === targetInst && (inCapturePhase = new inCapturePhase(
                  reactEventName,
                  instance + "enter",
                  SyntheticEventCtor,
                  nativeEvent,
                  nativeEventTarget
                ), inCapturePhase.target = lastHostComponent, inCapturePhase.relatedTarget = accumulateTargetOnly, _instance = inCapturePhase);
                accumulateTargetOnly = _instance;
                inCapturePhase = reactName && SyntheticEventCtor ? getLowestCommonAncestor(
                  reactName,
                  SyntheticEventCtor,
                  getParent
                ) : null;
                null !== reactName && accumulateEnterLeaveListenersForEvent(
                  dispatchQueue,
                  reactEventType,
                  reactName,
                  inCapturePhase,
                  false
                );
                null !== SyntheticEventCtor && null !== accumulateTargetOnly && accumulateEnterLeaveListenersForEvent(
                  dispatchQueue,
                  accumulateTargetOnly,
                  SyntheticEventCtor,
                  inCapturePhase,
                  true
                );
              }
            }
          }
          a: {
            reactName = targetInst ? getNodeFromInstance(targetInst) : window;
            SyntheticEventCtor = reactName.nodeName && reactName.nodeName.toLowerCase();
            if ("select" === SyntheticEventCtor || "input" === SyntheticEventCtor && "file" === reactName.type)
              var getTargetInstFunc = getTargetInstForChangeEvent;
            else if (isTextInputElement(reactName))
              if (isInputEventSupported)
                getTargetInstFunc = getTargetInstForInputOrChangeEvent;
              else {
                getTargetInstFunc = getTargetInstForInputEventPolyfill;
                var handleEventFunc = handleEventsForInputEventPolyfill;
              }
            else
              SyntheticEventCtor = reactName.nodeName, !SyntheticEventCtor || "input" !== SyntheticEventCtor.toLowerCase() || "checkbox" !== reactName.type && "radio" !== reactName.type ? targetInst && isCustomElement(targetInst.elementType) && (getTargetInstFunc = getTargetInstForChangeEvent) : getTargetInstFunc = getTargetInstForClickEvent;
            if (getTargetInstFunc && (getTargetInstFunc = getTargetInstFunc(domEventName, targetInst))) {
              createAndAccumulateChangeEvent(
                dispatchQueue,
                getTargetInstFunc,
                nativeEvent,
                nativeEventTarget
              );
              break a;
            }
            handleEventFunc && handleEventFunc(domEventName, reactName, targetInst);
          }
          handleEventFunc = targetInst ? getNodeFromInstance(targetInst) : window;
          switch (domEventName) {
            case "focusin":
              if (isTextInputElement(handleEventFunc) || "true" === handleEventFunc.contentEditable)
                activeElement = handleEventFunc, activeElementInst = targetInst, lastSelection = null;
              break;
            case "focusout":
              lastSelection = activeElementInst = activeElement = null;
              break;
            case "mousedown":
              mouseDown = true;
              break;
            case "contextmenu":
            case "mouseup":
            case "dragend":
              mouseDown = false;
              constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
              break;
            case "selectionchange":
              if (skipSelectionChangeEvent) break;
            case "keydown":
            case "keyup":
              constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
          }
          var fallbackData;
          if (canUseCompositionEvent)
            b: {
              switch (domEventName) {
                case "compositionstart":
                  var eventType = "onCompositionStart";
                  break b;
                case "compositionend":
                  eventType = "onCompositionEnd";
                  break b;
                case "compositionupdate":
                  eventType = "onCompositionUpdate";
                  break b;
              }
              eventType = void 0;
            }
          else
            isComposing ? isFallbackCompositionEnd(domEventName, nativeEvent) && (eventType = "onCompositionEnd") : "keydown" === domEventName && 229 === nativeEvent.keyCode && (eventType = "onCompositionStart");
          eventType && (useFallbackCompositionData && "ko" !== nativeEvent.locale && (isComposing || "onCompositionStart" !== eventType ? "onCompositionEnd" === eventType && isComposing && (fallbackData = getData()) : (root = nativeEventTarget, startText = "value" in root ? root.value : root.textContent, isComposing = true)), handleEventFunc = accumulateTwoPhaseListeners(targetInst, eventType), 0 < handleEventFunc.length && (eventType = new SyntheticCompositionEvent(
            eventType,
            domEventName,
            null,
            nativeEvent,
            nativeEventTarget
          ), dispatchQueue.push({ event: eventType, listeners: handleEventFunc }), fallbackData ? eventType.data = fallbackData : (fallbackData = getDataFromCustomEvent(nativeEvent), null !== fallbackData && (eventType.data = fallbackData))));
          if (fallbackData = canUseTextInputEvent ? getNativeBeforeInputChars(domEventName, nativeEvent) : getFallbackBeforeInputChars(domEventName, nativeEvent))
            eventType = accumulateTwoPhaseListeners(targetInst, "onBeforeInput"), 0 < eventType.length && (handleEventFunc = new SyntheticCompositionEvent(
              "onBeforeInput",
              "beforeinput",
              null,
              nativeEvent,
              nativeEventTarget
            ), dispatchQueue.push({
              event: handleEventFunc,
              listeners: eventType
            }), handleEventFunc.data = fallbackData);
          extractEvents$1(
            dispatchQueue,
            domEventName,
            targetInst,
            nativeEvent,
            nativeEventTarget
          );
        }
        processDispatchQueue(dispatchQueue, eventSystemFlags);
      });
    }
    function createDispatchListener(instance, listener, currentTarget) {
      return {
        instance,
        listener,
        currentTarget
      };
    }
    function accumulateTwoPhaseListeners(targetFiber, reactName) {
      for (var captureName = reactName + "Capture", listeners2 = []; null !== targetFiber; ) {
        var _instance2 = targetFiber, stateNode = _instance2.stateNode;
        _instance2 = _instance2.tag;
        5 !== _instance2 && 26 !== _instance2 && 27 !== _instance2 || null === stateNode || (_instance2 = getListener(targetFiber, captureName), null != _instance2 && listeners2.unshift(
          createDispatchListener(targetFiber, _instance2, stateNode)
        ), _instance2 = getListener(targetFiber, reactName), null != _instance2 && listeners2.push(
          createDispatchListener(targetFiber, _instance2, stateNode)
        ));
        if (3 === targetFiber.tag) return listeners2;
        targetFiber = targetFiber.return;
      }
      return [];
    }
    function getParent(inst) {
      if (null === inst) return null;
      do
        inst = inst.return;
      while (inst && 5 !== inst.tag && 27 !== inst.tag);
      return inst ? inst : null;
    }
    function accumulateEnterLeaveListenersForEvent(dispatchQueue, event, target, common, inCapturePhase) {
      for (var registrationName = event._reactName, listeners2 = []; null !== target && target !== common; ) {
        var _instance3 = target, alternate = _instance3.alternate, stateNode = _instance3.stateNode;
        _instance3 = _instance3.tag;
        if (null !== alternate && alternate === common) break;
        5 !== _instance3 && 26 !== _instance3 && 27 !== _instance3 || null === stateNode || (alternate = stateNode, inCapturePhase ? (stateNode = getListener(target, registrationName), null != stateNode && listeners2.unshift(
          createDispatchListener(target, stateNode, alternate)
        )) : inCapturePhase || (stateNode = getListener(target, registrationName), null != stateNode && listeners2.push(
          createDispatchListener(target, stateNode, alternate)
        )));
        target = target.return;
      }
      0 !== listeners2.length && dispatchQueue.push({ event, listeners: listeners2 });
    }
    var NORMALIZE_NEWLINES_REGEX = /\r\n?/g;
    var NORMALIZE_NULL_AND_REPLACEMENT_REGEX = /\u0000|\uFFFD/g;
    function normalizeMarkupForTextOrAttribute(markup) {
      return ("string" === typeof markup ? markup : "" + markup).replace(NORMALIZE_NEWLINES_REGEX, "\n").replace(NORMALIZE_NULL_AND_REPLACEMENT_REGEX, "");
    }
    function checkForUnmatchedText(serverText, clientText) {
      clientText = normalizeMarkupForTextOrAttribute(clientText);
      return normalizeMarkupForTextOrAttribute(serverText) === clientText ? true : false;
    }
    function setProp(domElement, tag, key2, value, props, prevValue) {
      switch (key2) {
        case "children":
          if ("string" === typeof value)
            "body" === tag || "textarea" === tag && "" === value || setTextContent(domElement, value);
          else if ("number" === typeof value || "bigint" === typeof value)
            "body" !== tag && setTextContent(domElement, "" + value);
          else return;
          break;
        case "className":
          setValueForKnownAttribute(domElement, "class", value);
          break;
        case "tabIndex":
          setValueForKnownAttribute(domElement, "tabindex", value);
          break;
        case "dir":
        case "role":
        case "viewBox":
        case "width":
        case "height":
          setValueForKnownAttribute(domElement, key2, value);
          break;
        case "style":
          setValueForStyles(domElement, value, prevValue);
          return;
        case "data":
          if ("object" !== tag) {
            setValueForKnownAttribute(domElement, "data", value);
            break;
          }
        case "src":
        case "href":
          if ("" === value && ("a" !== tag || "href" !== key2)) {
            domElement.removeAttribute(key2);
            break;
          }
          if (null == value || "function" === typeof value || "symbol" === typeof value || "boolean" === typeof value) {
            domElement.removeAttribute(key2);
            break;
          }
          value = sanitizeURL(value);
          domElement.setAttribute(key2, value);
          break;
        case "action":
        case "formAction":
          if ("function" === typeof value) {
            domElement.setAttribute(
              key2,
              "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')"
            );
            break;
          } else
            "function" === typeof prevValue && ("formAction" === key2 ? ("input" !== tag && setProp(domElement, tag, "name", props.name, props, null), setProp(
              domElement,
              tag,
              "formEncType",
              props.formEncType,
              props,
              null
            ), setProp(
              domElement,
              tag,
              "formMethod",
              props.formMethod,
              props,
              null
            ), setProp(
              domElement,
              tag,
              "formTarget",
              props.formTarget,
              props,
              null
            )) : (setProp(domElement, tag, "encType", props.encType, props, null), setProp(domElement, tag, "method", props.method, props, null), setProp(domElement, tag, "target", props.target, props, null)));
          if (null == value || "symbol" === typeof value || "boolean" === typeof value) {
            domElement.removeAttribute(key2);
            break;
          }
          value = sanitizeURL(value);
          domElement.setAttribute(key2, value);
          break;
        case "onClick":
          null != value && (domElement.onclick = noop$1);
          return;
        case "onScroll":
          null != value && listenToNonDelegatedEvent("scroll", domElement);
          return;
        case "onScrollEnd":
          null != value && listenToNonDelegatedEvent("scrollend", domElement);
          return;
        case "dangerouslySetInnerHTML":
          if (null != value) {
            if ("object" !== typeof value || !("__html" in value))
              throw Error(formatProdErrorMessage(61));
            key2 = value.__html;
            if (null != key2) {
              if (null != props.children) throw Error(formatProdErrorMessage(60));
              (null != prevValue ? prevValue.__html : void 0) !== key2 && (domElement.innerHTML = key2);
            }
          }
          break;
        case "multiple":
          domElement.multiple = value && "function" !== typeof value && "symbol" !== typeof value;
          break;
        case "muted":
          domElement.muted = value && "function" !== typeof value && "symbol" !== typeof value;
          break;
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
        case "defaultValue":
        case "defaultChecked":
        case "innerHTML":
        case "ref":
          break;
        case "autoFocus":
          break;
        case "xlinkHref":
          if (null == value || "function" === typeof value || "boolean" === typeof value || "symbol" === typeof value) {
            domElement.removeAttribute("xlink:href");
            break;
          }
          key2 = sanitizeURL(value);
          domElement.setAttributeNS(
            "http://www.w3.org/1999/xlink",
            "xlink:href",
            key2
          );
          break;
        case "contentEditable":
        case "spellCheck":
        case "draggable":
        case "value":
        case "autoReverse":
        case "externalResourcesRequired":
        case "focusable":
        case "preserveAlpha":
          null != value && "function" !== typeof value && "symbol" !== typeof value ? domElement.setAttribute(key2, value) : domElement.removeAttribute(key2);
          break;
        case "inert":
        case "allowFullScreen":
        case "async":
        case "autoPlay":
        case "controls":
        case "credentialless":
        case "default":
        case "defer":
        case "disabled":
        case "disablePictureInPicture":
        case "disableRemotePlayback":
        case "formNoValidate":
        case "hidden":
        case "loop":
        case "noModule":
        case "noValidate":
        case "open":
        case "playsInline":
        case "readOnly":
        case "required":
        case "reversed":
        case "scoped":
        case "seamless":
        case "itemScope":
          value && "function" !== typeof value && "symbol" !== typeof value ? domElement.setAttribute(key2, "") : domElement.removeAttribute(key2);
          break;
        case "capture":
        case "download":
          true === value ? domElement.setAttribute(key2, "") : false !== value && null != value && "function" !== typeof value && "symbol" !== typeof value ? domElement.setAttribute(key2, value) : domElement.removeAttribute(key2);
          break;
        case "cols":
        case "rows":
        case "size":
        case "span":
          null != value && "function" !== typeof value && "symbol" !== typeof value && !isNaN(value) && 1 <= value ? domElement.setAttribute(key2, value) : domElement.removeAttribute(key2);
          break;
        case "rowSpan":
        case "start":
          null == value || "function" === typeof value || "symbol" === typeof value || isNaN(value) ? domElement.removeAttribute(key2) : domElement.setAttribute(key2, value);
          break;
        case "popover":
          listenToNonDelegatedEvent("beforetoggle", domElement);
          listenToNonDelegatedEvent("toggle", domElement);
          setValueForAttribute(domElement, "popover", value);
          break;
        case "xlinkActuate":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:actuate",
            value
          );
          break;
        case "xlinkArcrole":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:arcrole",
            value
          );
          break;
        case "xlinkRole":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:role",
            value
          );
          break;
        case "xlinkShow":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:show",
            value
          );
          break;
        case "xlinkTitle":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:title",
            value
          );
          break;
        case "xlinkType":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:type",
            value
          );
          break;
        case "xmlBase":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/XML/1998/namespace",
            "xml:base",
            value
          );
          break;
        case "xmlLang":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/XML/1998/namespace",
            "xml:lang",
            value
          );
          break;
        case "xmlSpace":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/XML/1998/namespace",
            "xml:space",
            value
          );
          break;
        case "is":
          setValueForAttribute(domElement, "is", value);
          break;
        case "innerText":
        case "textContent":
          return;
        default:
          if (!(2 < key2.length) || "o" !== key2[0] && "O" !== key2[0] || "n" !== key2[1] && "N" !== key2[1])
            key2 = aliases.get(key2) || key2, setValueForAttribute(domElement, key2, value);
          else return;
      }
      viewTransitionMutationContext = true;
    }
    function setPropOnCustomElement(domElement, tag, key2, value, props, prevValue) {
      switch (key2) {
        case "style":
          setValueForStyles(domElement, value, prevValue);
          return;
        case "dangerouslySetInnerHTML":
          if (null != value) {
            if ("object" !== typeof value || !("__html" in value))
              throw Error(formatProdErrorMessage(61));
            key2 = value.__html;
            if (null != key2) {
              if (null != props.children) throw Error(formatProdErrorMessage(60));
              (null != prevValue ? prevValue.__html : void 0) !== key2 && (domElement.innerHTML = key2);
            }
          }
          break;
        case "children":
          if ("string" === typeof value) setTextContent(domElement, value);
          else if ("number" === typeof value || "bigint" === typeof value)
            setTextContent(domElement, "" + value);
          else return;
          break;
        case "onScroll":
          null != value && listenToNonDelegatedEvent("scroll", domElement);
          return;
        case "onScrollEnd":
          null != value && listenToNonDelegatedEvent("scrollend", domElement);
          return;
        case "onClick":
          null != value && (domElement.onclick = noop$1);
          return;
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
        case "innerHTML":
        case "ref":
          return;
        case "innerText":
        case "textContent":
          return;
        default:
          if (!registrationNameDependencies.hasOwnProperty(key2))
            a: {
              if ("o" === key2[0] && "n" === key2[1] && (props = key2.endsWith("Capture"), prevValue = key2.slice(2, props ? key2.length - 7 : void 0), tag = domElement[internalPropsKey] || null, tag = null != tag ? tag[key2] : null, "function" === typeof tag && domElement.removeEventListener(prevValue, tag, props), "function" === typeof value)) {
                "function" !== typeof tag && null !== tag && (key2 in domElement ? domElement[key2] = null : domElement.hasAttribute(key2) && domElement.removeAttribute(key2));
                domElement.addEventListener(prevValue, value, props);
                break a;
              }
              viewTransitionMutationContext = true;
              key2 in domElement ? domElement[key2] = value : true === value ? domElement.setAttribute(key2, "") : setValueForAttribute(domElement, key2, value);
            }
          return;
      }
      viewTransitionMutationContext = true;
    }
    function setInitialProperties(domElement, tag, props) {
      switch (tag) {
        case "div":
        case "span":
        case "svg":
        case "path":
        case "a":
        case "g":
        case "p":
        case "li":
          break;
        case "img":
          listenToNonDelegatedEvent("error", domElement);
          listenToNonDelegatedEvent("load", domElement);
          var hasSrc = false, hasSrcSet = false, propKey;
          for (propKey in props)
            if (props.hasOwnProperty(propKey)) {
              var propValue = props[propKey];
              if (null != propValue)
                switch (propKey) {
                  case "src":
                    hasSrc = true;
                    break;
                  case "srcSet":
                    hasSrcSet = true;
                    break;
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(formatProdErrorMessage(137, tag));
                  default:
                    setProp(domElement, tag, propKey, propValue, props, null);
                }
            }
          hasSrcSet && setProp(domElement, tag, "srcSet", props.srcSet, props, null);
          hasSrc && setProp(domElement, tag, "src", props.src, props, null);
          return;
        case "input":
          listenToNonDelegatedEvent("invalid", domElement);
          var defaultValue = propKey = propValue = hasSrcSet = null, checked = null, defaultChecked = null;
          for (hasSrc in props)
            if (props.hasOwnProperty(hasSrc)) {
              var propValue$204 = props[hasSrc];
              if (null != propValue$204)
                switch (hasSrc) {
                  case "name":
                    hasSrcSet = propValue$204;
                    break;
                  case "type":
                    propValue = propValue$204;
                    break;
                  case "checked":
                    checked = propValue$204;
                    break;
                  case "defaultChecked":
                    defaultChecked = propValue$204;
                    break;
                  case "value":
                    propKey = propValue$204;
                    break;
                  case "defaultValue":
                    defaultValue = propValue$204;
                    break;
                  case "children":
                  case "dangerouslySetInnerHTML":
                    if (null != propValue$204)
                      throw Error(formatProdErrorMessage(137, tag));
                    break;
                  default:
                    setProp(domElement, tag, hasSrc, propValue$204, props, null);
                }
            }
          initInput(
            domElement,
            propKey,
            defaultValue,
            checked,
            defaultChecked,
            propValue,
            hasSrcSet,
            false
          );
          return;
        case "select":
          listenToNonDelegatedEvent("invalid", domElement);
          hasSrc = propValue = propKey = null;
          for (hasSrcSet in props)
            if (props.hasOwnProperty(hasSrcSet) && (defaultValue = props[hasSrcSet], null != defaultValue))
              switch (hasSrcSet) {
                case "value":
                  propKey = defaultValue;
                  break;
                case "defaultValue":
                  propValue = defaultValue;
                  break;
                case "multiple":
                  hasSrc = defaultValue;
                default:
                  setProp(domElement, tag, hasSrcSet, defaultValue, props, null);
              }
          tag = propKey;
          props = propValue;
          domElement.multiple = !!hasSrc;
          null != tag ? updateOptions(domElement, !!hasSrc, tag, false) : null != props && updateOptions(domElement, !!hasSrc, props, true);
          return;
        case "textarea":
          listenToNonDelegatedEvent("invalid", domElement);
          propKey = hasSrcSet = hasSrc = null;
          for (propValue in props)
            if (props.hasOwnProperty(propValue) && (defaultValue = props[propValue], null != defaultValue))
              switch (propValue) {
                case "value":
                  hasSrc = defaultValue;
                  break;
                case "defaultValue":
                  hasSrcSet = defaultValue;
                  break;
                case "children":
                  propKey = defaultValue;
                  break;
                case "dangerouslySetInnerHTML":
                  if (null != defaultValue) throw Error(formatProdErrorMessage(91));
                  break;
                default:
                  setProp(domElement, tag, propValue, defaultValue, props, null);
              }
          initTextarea(domElement, hasSrc, hasSrcSet, propKey);
          return;
        case "option":
          for (checked in props)
            if (props.hasOwnProperty(checked) && (hasSrc = props[checked], null != hasSrc))
              switch (checked) {
                case "selected":
                  domElement.selected = hasSrc && "function" !== typeof hasSrc && "symbol" !== typeof hasSrc;
                  break;
                default:
                  setProp(domElement, tag, checked, hasSrc, props, null);
              }
          return;
        case "dialog":
          listenToNonDelegatedEvent("beforetoggle", domElement);
          listenToNonDelegatedEvent("toggle", domElement);
          listenToNonDelegatedEvent("cancel", domElement);
          listenToNonDelegatedEvent("close", domElement);
          break;
        case "iframe":
        case "object":
          listenToNonDelegatedEvent("load", domElement);
          break;
        case "video":
        case "audio":
          for (hasSrc = 0; hasSrc < mediaEventTypes.length; hasSrc++)
            listenToNonDelegatedEvent(mediaEventTypes[hasSrc], domElement);
          break;
        case "image":
          listenToNonDelegatedEvent("error", domElement);
          listenToNonDelegatedEvent("load", domElement);
          break;
        case "details":
          listenToNonDelegatedEvent("toggle", domElement);
          break;
        case "embed":
        case "source":
        case "link":
          listenToNonDelegatedEvent("error", domElement), listenToNonDelegatedEvent("load", domElement);
        case "area":
        case "base":
        case "br":
        case "col":
        case "hr":
        case "keygen":
        case "meta":
        case "param":
        case "track":
        case "wbr":
        case "menuitem":
          for (defaultChecked in props)
            if (props.hasOwnProperty(defaultChecked) && (hasSrc = props[defaultChecked], null != hasSrc))
              switch (defaultChecked) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(formatProdErrorMessage(137, tag));
                default:
                  setProp(domElement, tag, defaultChecked, hasSrc, props, null);
              }
          return;
        default:
          if (isCustomElement(tag)) {
            for (propValue$204 in props)
              props.hasOwnProperty(propValue$204) && (hasSrc = props[propValue$204], void 0 !== hasSrc && setPropOnCustomElement(
                domElement,
                tag,
                propValue$204,
                hasSrc,
                props,
                void 0
              ));
            return;
          }
      }
      for (defaultValue in props)
        props.hasOwnProperty(defaultValue) && (hasSrc = props[defaultValue], null != hasSrc && setProp(domElement, tag, defaultValue, hasSrc, props, null));
    }
    var emptyProps = {};
    function updateProperties(domElement, tag, lastProps, nextProps) {
      switch (tag) {
        case "div":
        case "span":
        case "svg":
        case "path":
        case "a":
        case "g":
        case "p":
        case "li":
          break;
        case "input":
          var name = null, type = null, value = null, defaultValue = null, lastDefaultValue = null, checked = null, defaultChecked = null;
          for (propKey in lastProps) {
            var lastProp = lastProps[propKey];
            if (lastProps.hasOwnProperty(propKey) && null != lastProp)
              switch (propKey) {
                case "checked":
                  break;
                case "value":
                  break;
                case "defaultValue":
                  lastDefaultValue = lastProp;
                default:
                  nextProps.hasOwnProperty(propKey) || setProp(domElement, tag, propKey, null, nextProps, lastProp);
              }
          }
          for (var propKey$221 in nextProps) {
            var propKey = nextProps[propKey$221];
            lastProp = lastProps[propKey$221];
            if (nextProps.hasOwnProperty(propKey$221) && (null != propKey || null != lastProp))
              switch (propKey$221) {
                case "type":
                  propKey !== lastProp && (viewTransitionMutationContext = true);
                  type = propKey;
                  break;
                case "name":
                  propKey !== lastProp && (viewTransitionMutationContext = true);
                  name = propKey;
                  break;
                case "checked":
                  propKey !== lastProp && (viewTransitionMutationContext = true);
                  checked = propKey;
                  break;
                case "defaultChecked":
                  propKey !== lastProp && (viewTransitionMutationContext = true);
                  defaultChecked = propKey;
                  break;
                case "value":
                  propKey !== lastProp && (viewTransitionMutationContext = true);
                  value = propKey;
                  break;
                case "defaultValue":
                  propKey !== lastProp && (viewTransitionMutationContext = true);
                  defaultValue = propKey;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  if (null != propKey)
                    throw Error(formatProdErrorMessage(137, tag));
                  break;
                default:
                  propKey !== lastProp && setProp(
                    domElement,
                    tag,
                    propKey$221,
                    propKey,
                    nextProps,
                    lastProp
                  );
              }
          }
          updateInput(
            domElement,
            value,
            defaultValue,
            lastDefaultValue,
            checked,
            defaultChecked,
            type,
            name
          );
          return;
        case "select":
          propKey = value = defaultValue = propKey$221 = null;
          for (type in lastProps)
            if (lastDefaultValue = lastProps[type], lastProps.hasOwnProperty(type) && null != lastDefaultValue)
              switch (type) {
                case "value":
                  break;
                case "multiple":
                  propKey = lastDefaultValue;
                default:
                  nextProps.hasOwnProperty(type) || setProp(
                    domElement,
                    tag,
                    type,
                    null,
                    nextProps,
                    lastDefaultValue
                  );
              }
          for (name in nextProps)
            if (type = nextProps[name], lastDefaultValue = lastProps[name], nextProps.hasOwnProperty(name) && (null != type || null != lastDefaultValue))
              switch (name) {
                case "value":
                  type !== lastDefaultValue && (viewTransitionMutationContext = true);
                  propKey$221 = type;
                  break;
                case "defaultValue":
                  type !== lastDefaultValue && (viewTransitionMutationContext = true);
                  defaultValue = type;
                  break;
                case "multiple":
                  type !== lastDefaultValue && (viewTransitionMutationContext = true), value = type;
                default:
                  type !== lastDefaultValue && setProp(
                    domElement,
                    tag,
                    name,
                    type,
                    nextProps,
                    lastDefaultValue
                  );
              }
          tag = defaultValue;
          lastProps = value;
          nextProps = propKey;
          null != propKey$221 ? updateOptions(domElement, !!lastProps, propKey$221, false) : !!nextProps !== !!lastProps && (null != tag ? updateOptions(domElement, !!lastProps, tag, true) : updateOptions(domElement, !!lastProps, lastProps ? [] : "", false));
          return;
        case "textarea":
          propKey = propKey$221 = null;
          for (defaultValue in lastProps)
            if (name = lastProps[defaultValue], lastProps.hasOwnProperty(defaultValue) && null != name && !nextProps.hasOwnProperty(defaultValue))
              switch (defaultValue) {
                case "value":
                  break;
                case "children":
                  break;
                default:
                  setProp(domElement, tag, defaultValue, null, nextProps, name);
              }
          for (value in nextProps)
            if (name = nextProps[value], type = lastProps[value], nextProps.hasOwnProperty(value) && (null != name || null != type))
              switch (value) {
                case "value":
                  name !== type && (viewTransitionMutationContext = true);
                  propKey$221 = name;
                  break;
                case "defaultValue":
                  name !== type && (viewTransitionMutationContext = true);
                  propKey = name;
                  break;
                case "children":
                  break;
                case "dangerouslySetInnerHTML":
                  if (null != name) throw Error(formatProdErrorMessage(91));
                  break;
                default:
                  name !== type && setProp(domElement, tag, value, name, nextProps, type);
              }
          updateTextarea(domElement, propKey$221, propKey);
          return;
        case "option":
          for (var propKey$237 in lastProps)
            if (propKey$221 = lastProps[propKey$237], lastProps.hasOwnProperty(propKey$237) && null != propKey$221 && !nextProps.hasOwnProperty(propKey$237))
              switch (propKey$237) {
                case "selected":
                  domElement.selected = false;
                  break;
                default:
                  setProp(
                    domElement,
                    tag,
                    propKey$237,
                    null,
                    nextProps,
                    propKey$221
                  );
              }
          for (lastDefaultValue in nextProps)
            if (propKey$221 = nextProps[lastDefaultValue], propKey = lastProps[lastDefaultValue], nextProps.hasOwnProperty(lastDefaultValue) && propKey$221 !== propKey && (null != propKey$221 || null != propKey))
              switch (lastDefaultValue) {
                case "selected":
                  propKey$221 !== propKey && (viewTransitionMutationContext = true);
                  domElement.selected = propKey$221 && "function" !== typeof propKey$221 && "symbol" !== typeof propKey$221;
                  break;
                default:
                  setProp(
                    domElement,
                    tag,
                    lastDefaultValue,
                    propKey$221,
                    nextProps,
                    propKey
                  );
              }
          return;
        case "img":
        case "link":
        case "area":
        case "base":
        case "br":
        case "col":
        case "embed":
        case "hr":
        case "keygen":
        case "meta":
        case "param":
        case "source":
        case "track":
        case "wbr":
        case "menuitem":
          for (var propKey$242 in lastProps)
            propKey$221 = lastProps[propKey$242], lastProps.hasOwnProperty(propKey$242) && null != propKey$221 && !nextProps.hasOwnProperty(propKey$242) && setProp(domElement, tag, propKey$242, null, nextProps, propKey$221);
          for (checked in nextProps)
            if (propKey$221 = nextProps[checked], propKey = lastProps[checked], nextProps.hasOwnProperty(checked) && propKey$221 !== propKey && (null != propKey$221 || null != propKey))
              switch (checked) {
                case "children":
                case "dangerouslySetInnerHTML":
                  if (null != propKey$221)
                    throw Error(formatProdErrorMessage(137, tag));
                  break;
                default:
                  setProp(
                    domElement,
                    tag,
                    checked,
                    propKey$221,
                    nextProps,
                    propKey
                  );
              }
          return;
        default:
          if (isCustomElement(tag)) {
            for (var propKey$247 in lastProps)
              propKey$221 = lastProps[propKey$247], lastProps.hasOwnProperty(propKey$247) && void 0 !== propKey$221 && !nextProps.hasOwnProperty(propKey$247) && setPropOnCustomElement(
                domElement,
                tag,
                propKey$247,
                void 0,
                nextProps,
                propKey$221
              );
            for (defaultChecked in nextProps)
              propKey$221 = nextProps[defaultChecked], propKey = lastProps[defaultChecked], !nextProps.hasOwnProperty(defaultChecked) || propKey$221 === propKey || void 0 === propKey$221 && void 0 === propKey || setPropOnCustomElement(
                domElement,
                tag,
                defaultChecked,
                propKey$221,
                nextProps,
                propKey
              );
            return;
          }
      }
      for (var propKey$252 in lastProps)
        propKey$221 = lastProps[propKey$252], lastProps.hasOwnProperty(propKey$252) && null != propKey$221 && !nextProps.hasOwnProperty(propKey$252) && setProp(domElement, tag, propKey$252, null, nextProps, propKey$221);
      for (lastProp in nextProps)
        propKey$221 = nextProps[lastProp], propKey = lastProps[lastProp], !nextProps.hasOwnProperty(lastProp) || propKey$221 === propKey || null == propKey$221 && null == propKey || setProp(domElement, tag, lastProp, propKey$221, nextProps, propKey);
    }
    function isLikelyStaticResource(initiatorType) {
      switch (initiatorType) {
        case "css":
        case "script":
        case "font":
        case "img":
        case "image":
        case "input":
        case "link":
          return true;
        default:
          return false;
      }
    }
    function estimateBandwidth() {
      if ("function" === typeof performance.getEntriesByType) {
        for (var count = 0, bits = 0, resourceEntries = performance.getEntriesByType("resource"), i = 0; i < resourceEntries.length; i++) {
          var entry = resourceEntries[i], transferSize = entry.transferSize, initiatorType = entry.initiatorType, duration = entry.duration;
          if (transferSize && duration && isLikelyStaticResource(initiatorType)) {
            initiatorType = 0;
            duration = entry.responseEnd;
            for (i += 1; i < resourceEntries.length; i++) {
              var overlapEntry = resourceEntries[i], overlapStartTime = overlapEntry.startTime;
              if (overlapStartTime > duration) break;
              var overlapTransferSize = overlapEntry.transferSize, overlapInitiatorType = overlapEntry.initiatorType;
              overlapTransferSize && isLikelyStaticResource(overlapInitiatorType) && (overlapEntry = overlapEntry.responseEnd, initiatorType += overlapTransferSize * (overlapEntry < duration ? 1 : (duration - overlapStartTime) / (overlapEntry - overlapStartTime)));
            }
            --i;
            bits += 8 * (transferSize + initiatorType) / (entry.duration / 1e3);
            count++;
            if (10 < count) break;
          }
        }
        if (0 < count) return bits / count / 1e6;
      }
      return navigator.connection && (count = navigator.connection.downlink, "number" === typeof count) ? count : 5;
    }
    var eventsEnabled = null;
    var selectionInformation = null;
    function getOwnerDocumentFromRootContainer(rootContainerElement) {
      return 9 === rootContainerElement.nodeType ? rootContainerElement : rootContainerElement.ownerDocument;
    }
    function getOwnHostContext(namespaceURI) {
      switch (namespaceURI) {
        case "http://www.w3.org/2000/svg":
          return 1;
        case "http://www.w3.org/1998/Math/MathML":
          return 2;
        default:
          return 0;
      }
    }
    function getChildHostContextProd(parentNamespace, type) {
      if (0 === parentNamespace)
        switch (type) {
          case "svg":
            return 1;
          case "math":
            return 2;
          default:
            return 0;
        }
      return 1 === parentNamespace && "foreignObject" === type ? 0 : parentNamespace;
    }
    function createHoistableInstance(type, props, rootContainerInstance, internalInstanceHandle) {
      rootContainerInstance = getOwnerDocumentFromRootContainer(
        rootContainerInstance
      ).createElement(type);
      rootContainerInstance[internalInstanceKey] = internalInstanceHandle;
      rootContainerInstance[internalPropsKey] = props;
      setInitialProperties(rootContainerInstance, type, props);
      markNodeAsHoistable(rootContainerInstance);
      return rootContainerInstance;
    }
    function shouldSetTextContent(type, props) {
      return "textarea" === type || "noscript" === type || "string" === typeof props.children || "number" === typeof props.children || "bigint" === typeof props.children || "object" === typeof props.dangerouslySetInnerHTML && null !== props.dangerouslySetInnerHTML && null != props.dangerouslySetInnerHTML.__html;
    }
    var currentPopstateTransitionEvent = null;
    function shouldAttemptEagerTransition() {
      var event = window.event;
      if (event && "popstate" === event.type) {
        if (event === currentPopstateTransitionEvent) return false;
        currentPopstateTransitionEvent = event;
        return true;
      }
      currentPopstateTransitionEvent = null;
      return false;
    }
    var scheduleTimeout = "function" === typeof setTimeout ? setTimeout : void 0;
    var cancelTimeout = "function" === typeof clearTimeout ? clearTimeout : void 0;
    var localPromise = "function" === typeof Promise ? Promise : void 0;
    var localRequestAnimationFrame = "function" === typeof requestAnimationFrame ? requestAnimationFrame : scheduleTimeout;
    var scheduleMicrotask = "function" === typeof queueMicrotask ? queueMicrotask : "undefined" !== typeof localPromise ? function(callback) {
      return localPromise.resolve(null).then(callback).catch(handleErrorInNextTick);
    } : scheduleTimeout;
    function handleErrorInNextTick(error) {
      setTimeout(function() {
        throw error;
      });
    }
    function isSingletonScope(type) {
      return "head" === type;
    }
    function clearHydrationBoundary(parentInstance, hydrationInstance) {
      var node = hydrationInstance, depth = 0;
      do {
        var nextNode = node.nextSibling;
        parentInstance.removeChild(node);
        if (nextNode && 8 === nextNode.nodeType)
          if (node = nextNode.data, "/$" === node || "/&" === node) {
            if (0 === depth) {
              parentInstance.removeChild(nextNode);
              retryIfBlockedOn(hydrationInstance);
              return;
            }
            depth--;
          } else if ("$" === node || "$?" === node || "$~" === node || "$!" === node || "&" === node)
            depth++;
          else if ("html" === node)
            clearSingletonPreambleContribution(
              parentInstance.ownerDocument.documentElement
            );
          else if ("head" === node) {
            node = parentInstance.ownerDocument.head;
            clearSingletonPreambleContribution(node);
            for (var node$jscomp$0 = node.firstChild; node$jscomp$0; ) {
              var nextNode$jscomp$0 = node$jscomp$0.nextSibling, nodeName = node$jscomp$0.nodeName;
              node$jscomp$0[internalHoistableMarker] || "SCRIPT" === nodeName || "STYLE" === nodeName || "LINK" === nodeName && "stylesheet" === node$jscomp$0.rel.toLowerCase() || node.removeChild(node$jscomp$0);
              node$jscomp$0 = nextNode$jscomp$0;
            }
          } else
            "body" === node && clearSingletonPreambleContribution(parentInstance.ownerDocument.body);
        node = nextNode;
      } while (node);
      retryIfBlockedOn(hydrationInstance);
    }
    function hideOrUnhideDehydratedBoundary(suspenseInstance, isHidden) {
      var node = suspenseInstance;
      suspenseInstance = 0;
      do {
        var nextNode = node.nextSibling;
        1 === node.nodeType ? isHidden ? (node._stashedDisplay = node.style.display, node.style.display = "none") : (node.style.display = node._stashedDisplay || "", "" === node.getAttribute("style") && node.removeAttribute("style")) : 3 === node.nodeType && (isHidden ? (node._stashedText = node.nodeValue, node.nodeValue = "") : node.nodeValue = node._stashedText || "");
        if (nextNode && 8 === nextNode.nodeType)
          if (node = nextNode.data, "/$" === node)
            if (0 === suspenseInstance) break;
            else suspenseInstance--;
          else
            "$" !== node && "$?" !== node && "$~" !== node && "$!" !== node || suspenseInstance++;
        node = nextNode;
      } while (node);
    }
    function applyViewTransitionName(instance, name, className) {
      name = CSS.escape(name) !== name ? "r-" + btoa(name).replace(/=/g, "") : name;
      instance.style.viewTransitionName = name;
      null != className && (instance.style.viewTransitionClass = className);
      className = getComputedStyle(instance);
      if ("inline" === className.display) {
        name = instance.getClientRects();
        if (1 === name.length) var JSCompiler_inline_result = 1;
        else
          for (var i = JSCompiler_inline_result = 0; i < name.length; i++) {
            var rect = name[i];
            0 < rect.width && 0 < rect.height && JSCompiler_inline_result++;
          }
        1 === JSCompiler_inline_result && (instance = instance.style, instance.display = 1 === name.length ? "inline-block" : "block", instance.marginTop = "-" + className.paddingTop, instance.marginBottom = "-" + className.paddingBottom);
      }
    }
    function restoreViewTransitionName(instance, props) {
      instance = instance.style;
      props = props.style;
      var viewTransitionName = null != props ? props.hasOwnProperty("viewTransitionName") ? props.viewTransitionName : props.hasOwnProperty("view-transition-name") ? props["view-transition-name"] : null : null;
      instance.viewTransitionName = null == viewTransitionName || "boolean" === typeof viewTransitionName ? "" : ("" + viewTransitionName).trim();
      viewTransitionName = null != props ? props.hasOwnProperty("viewTransitionClass") ? props.viewTransitionClass : props.hasOwnProperty("view-transition-class") ? props["view-transition-class"] : null : null;
      instance.viewTransitionClass = null == viewTransitionName || "boolean" === typeof viewTransitionName ? "" : ("" + viewTransitionName).trim();
      "inline-block" === instance.display && (null == props ? instance.display = instance.margin = "" : (viewTransitionName = props.display, instance.display = null == viewTransitionName || "boolean" === typeof viewTransitionName ? "" : viewTransitionName, viewTransitionName = props.margin, null != viewTransitionName ? instance.margin = viewTransitionName : (viewTransitionName = props.hasOwnProperty("marginTop") ? props.marginTop : props["margin-top"], instance.marginTop = null == viewTransitionName || "boolean" === typeof viewTransitionName ? "" : viewTransitionName, props = props.hasOwnProperty("marginBottom") ? props.marginBottom : props["margin-bottom"], instance.marginBottom = null == props || "boolean" === typeof props ? "" : props)));
    }
    function createMeasurement(rect, computedStyle, element) {
      element = element.ownerDocument.defaultView;
      return {
        rect,
        abs: "absolute" === computedStyle.position || "fixed" === computedStyle.position,
        clip: "none" !== computedStyle.clipPath || "visible" !== computedStyle.overflow || "none" !== computedStyle.filter || "none" !== computedStyle.mask || "none" !== computedStyle.mask || "0px" !== computedStyle.borderRadius,
        view: 0 <= rect.bottom && 0 <= rect.right && rect.top <= element.innerHeight && rect.left <= element.innerWidth
      };
    }
    function measureInstance(instance) {
      var rect = instance.getBoundingClientRect(), computedStyle = getComputedStyle(instance);
      return createMeasurement(rect, computedStyle, instance);
    }
    function measureClonedInstance(instance) {
      var measuredRect = instance.getBoundingClientRect();
      measuredRect = new DOMRect(
        measuredRect.x + 2e4,
        measuredRect.y + 2e4,
        measuredRect.width,
        measuredRect.height
      );
      var computedStyle = getComputedStyle(instance);
      return createMeasurement(measuredRect, computedStyle, instance);
    }
    function forceLayout(ownerDocument) {
      return ownerDocument.documentElement.clientHeight;
    }
    function waitForImageToLoad(resolve) {
      this.addEventListener("load", resolve);
      this.addEventListener("error", resolve);
    }
    function startViewTransition(suspendedState, rootContainer, transitionTypes, mutationCallback, layoutCallback, afterMutationCallback, spawnedWorkCallback, passiveCallback, errorCallback) {
      var ownerDocument = 9 === rootContainer.nodeType ? rootContainer : rootContainer.ownerDocument;
      try {
        var transition = ownerDocument.startViewTransition({
          update: function() {
            var ownerWindow = ownerDocument.defaultView, pendingNavigation = ownerWindow.navigation && ownerWindow.navigation.transition, previousFontLoadingStatus = ownerDocument.fonts.status;
            mutationCallback();
            var blockingPromises = [];
            "loaded" === previousFontLoadingStatus && (forceLayout(ownerDocument), "loading" === ownerDocument.fonts.status && blockingPromises.push(ownerDocument.fonts.ready));
            previousFontLoadingStatus = blockingPromises.length;
            if (null !== suspendedState)
              for (var suspenseyImages = suspendedState.suspenseyImages, imgBytes = 0, i = 0; i < suspenseyImages.length; i++) {
                var suspenseyImage = suspenseyImages[i];
                if (!suspenseyImage.complete) {
                  var rect = suspenseyImage.getBoundingClientRect();
                  if (0 < rect.bottom && 0 < rect.right && rect.top < ownerWindow.innerHeight && rect.left < ownerWindow.innerWidth) {
                    imgBytes += estimateImageBytes(suspenseyImage);
                    if (imgBytes > estimatedBytesWithinLimit) {
                      blockingPromises.length = previousFontLoadingStatus;
                      break;
                    }
                    suspenseyImage = new Promise(
                      waitForImageToLoad.bind(suspenseyImage)
                    );
                    blockingPromises.push(suspenseyImage);
                  }
                }
              }
            if (0 < blockingPromises.length)
              return ownerWindow = Promise.race([
                Promise.all(blockingPromises),
                new Promise(function(resolve) {
                  return setTimeout(resolve, 500);
                })
              ]).then(layoutCallback, layoutCallback), (pendingNavigation ? Promise.allSettled([pendingNavigation.finished, ownerWindow]) : ownerWindow).then(afterMutationCallback, afterMutationCallback);
            layoutCallback();
            if (pendingNavigation)
              return pendingNavigation.finished.then(
                afterMutationCallback,
                afterMutationCallback
              );
            afterMutationCallback();
          },
          types: transitionTypes
        });
        ownerDocument.__reactViewTransition = transition;
        var viewTransitionAnimations = [];
        transition.ready.then(
          function() {
            for (var animations = ownerDocument.documentElement.getAnimations({
              subtree: true
            }), i = 0; i < animations.length; i++) {
              var animation = animations[i], effect = animation.effect, pseudoElement = effect.pseudoElement;
              if (null != pseudoElement && pseudoElement.startsWith("::view-transition")) {
                viewTransitionAnimations.push(animation);
                animation = effect.getKeyframes();
                for (var height = pseudoElement = void 0, unchangedDimensions = true, j = 0; j < animation.length; j++) {
                  var keyframe = animation[j], w = keyframe.width;
                  if (void 0 === pseudoElement) pseudoElement = w;
                  else if (pseudoElement !== w) {
                    unchangedDimensions = false;
                    break;
                  }
                  w = keyframe.height;
                  if (void 0 === height) height = w;
                  else if (height !== w) {
                    unchangedDimensions = false;
                    break;
                  }
                  delete keyframe.width;
                  delete keyframe.height;
                  "none" === keyframe.transform && delete keyframe.transform;
                }
                unchangedDimensions && void 0 !== pseudoElement && void 0 !== height && (effect.setKeyframes(animation), unchangedDimensions = getComputedStyle(
                  effect.target,
                  effect.pseudoElement
                ), unchangedDimensions.width !== pseudoElement || unchangedDimensions.height !== height) && (unchangedDimensions = animation[0], unchangedDimensions.width = pseudoElement, unchangedDimensions.height = height, unchangedDimensions = animation[animation.length - 1], unchangedDimensions.width = pseudoElement, unchangedDimensions.height = height, effect.setKeyframes(animation));
              }
            }
            spawnedWorkCallback();
          },
          function(error) {
            ownerDocument.__reactViewTransition === transition && (ownerDocument.__reactViewTransition = null);
            try {
              if ("object" === typeof error && null !== error)
                switch (error.name) {
                  case "InvalidStateError":
                    if ("View transition was skipped because document visibility state is hidden." === error.message || "Skipping view transition because document visibility state has become hidden." === error.message || "Skipping view transition because viewport size changed." === error.message || "Transition was aborted because of invalid state" === error.message)
                      error = null;
                }
              null !== error && errorCallback(error);
            } finally {
              mutationCallback(), layoutCallback(), spawnedWorkCallback();
            }
          }
        );
        transition.finished.finally(function() {
          for (var i = 0; i < viewTransitionAnimations.length; i++)
            viewTransitionAnimations[i].cancel();
          ownerDocument.__reactViewTransition === transition && (ownerDocument.__reactViewTransition = null);
          passiveCallback();
        });
        return transition;
      } catch (x) {
        return mutationCallback(), layoutCallback(), spawnedWorkCallback(), null;
      }
    }
    function ViewTransitionPseudoElement(pseudo, name) {
      this._scope = document.documentElement;
      this._selector = "::view-transition-" + pseudo + "(" + name + ")";
    }
    ViewTransitionPseudoElement.prototype.animate = function(keyframes, options2) {
      options2 = "number" === typeof options2 ? { duration: options2 } : assign({}, options2);
      options2.pseudoElement = this._selector;
      return this._scope.animate(keyframes, options2);
    };
    ViewTransitionPseudoElement.prototype.getAnimations = function() {
      for (var scope = this._scope, selector = this._selector, animations = scope.getAnimations({ subtree: true }), result = [], i = 0; i < animations.length; i++) {
        var effect = animations[i].effect;
        null !== effect && effect.target === scope && effect.pseudoElement === selector && result.push(animations[i]);
      }
      return result;
    };
    ViewTransitionPseudoElement.prototype.getComputedStyle = function() {
      return getComputedStyle(this._scope, this._selector);
    };
    function createViewTransitionInstance(name) {
      return {
        name,
        group: new ViewTransitionPseudoElement("group", name),
        imagePair: new ViewTransitionPseudoElement("image-pair", name),
        old: new ViewTransitionPseudoElement("old", name),
        new: new ViewTransitionPseudoElement("new", name)
      };
    }
    function FragmentInstance(fragmentFiber) {
      this._fragmentFiber = fragmentFiber;
      this._observers = this._eventListeners = null;
    }
    FragmentInstance.prototype.addEventListener = function(type, listener, optionsOrUseCapture) {
      var signal = null, cleanup = null;
      if (null != optionsOrUseCapture && "boolean" !== typeof optionsOrUseCapture && (signal = optionsOrUseCapture.signal || null, null !== signal && signal.aborted))
        return;
      null === this._eventListeners && (this._eventListeners = []);
      var listeners2 = this._eventListeners;
      if (-1 === indexOfEventListener(listeners2, type, listener, optionsOrUseCapture)) {
        var fragmentInstance = this, attachedListener = listener;
        null != optionsOrUseCapture && "boolean" !== typeof optionsOrUseCapture && true === optionsOrUseCapture.once && (attachedListener = function(event) {
          fragmentInstance.removeEventListener(
            type,
            listener,
            optionsOrUseCapture
          );
          "function" === typeof listener ? listener.call(this, event) : listener.handleEvent(event);
        });
        null !== signal && (cleanup = fragmentInstance.removeEventListener.bind(
          fragmentInstance,
          type,
          listener,
          optionsOrUseCapture
        ), signal.addEventListener("abort", cleanup, { once: true }), cleanup = signal.removeEventListener.bind(signal, "abort", cleanup));
        signal = getAttachOptions(optionsOrUseCapture);
        listeners2.push({
          type,
          listener,
          optionsOrUseCapture,
          attachedListener,
          cleanup
        });
        traverseVisibleInstancesAndTextInstances(
          this._fragmentFiber.child,
          false,
          addEventListenerToChild,
          type,
          attachedListener,
          signal
        );
      }
      this._eventListeners = listeners2;
    };
    function addEventListenerToChild(child, type, listener, optionsOrUseCapture) {
      getInstanceFromHostFiber(child).addEventListener(
        type,
        listener,
        optionsOrUseCapture
      );
      return false;
    }
    FragmentInstance.prototype.removeEventListener = function(type, listener, optionsOrUseCapture) {
      var listeners2 = this._eventListeners;
      if (null !== listeners2 && (listener = indexOfEventListener(
        listeners2,
        type,
        listener,
        optionsOrUseCapture
      ), -1 !== listener)) {
        var _listeners$index = listeners2[listener];
        optionsOrUseCapture = _listeners$index.attachedListener;
        var cleanup = _listeners$index.cleanup;
        _listeners$index = getAttachOptions(_listeners$index.optionsOrUseCapture);
        traverseVisibleInstancesAndTextInstances(
          this._fragmentFiber.child,
          false,
          removeEventListenerFromChild,
          type,
          optionsOrUseCapture,
          _listeners$index
        );
        listeners2.splice(listener, 1);
        null !== cleanup && cleanup();
      }
    };
    function removeEventListenerFromChild(child, type, listener, optionsOrUseCapture) {
      getInstanceFromHostFiber(child).removeEventListener(
        type,
        listener,
        optionsOrUseCapture
      );
      return false;
    }
    function getAttachOptions(opts) {
      return null != opts && "boolean" !== typeof opts && (true === opts.once || opts.signal instanceof AbortSignal) ? { capture: opts.capture, passive: opts.passive } : opts;
    }
    function normalizeListenerOptions(opts) {
      return null == opts ? "c=0" : "boolean" === typeof opts ? "c=" + (opts ? "1" : "0") : "c=" + (opts.capture ? "1" : "0");
    }
    function indexOfEventListener(eventListeners, type, listener, optionsOrUseCapture) {
      if (0 === eventListeners.length) return -1;
      optionsOrUseCapture = normalizeListenerOptions(optionsOrUseCapture);
      for (var i = 0; i < eventListeners.length; i++) {
        var item = eventListeners[i];
        if (item.type === type && item.listener === listener && normalizeListenerOptions(item.optionsOrUseCapture) === optionsOrUseCapture)
          return i;
      }
      return -1;
    }
    FragmentInstance.prototype.dispatchEvent = function(event) {
      var parentHostFiber = getFragmentParentInstanceOrContainerFiber(
        this._fragmentFiber
      );
      if (null === parentHostFiber) return true;
      parentHostFiber = getInstanceFromHostFiber(parentHostFiber);
      var eventListeners = this._eventListeners;
      if (null !== eventListeners && 0 < eventListeners.length || !event.bubbles) {
        var temp = 9 === parentHostFiber.nodeType ? parentHostFiber.createComment("") : document.createTextNode("");
        if (eventListeners)
          for (var i = 0; i < eventListeners.length; i++) {
            var _eventListeners$i = eventListeners[i];
            temp.addEventListener(
              _eventListeners$i.type,
              _eventListeners$i.attachedListener,
              getAttachOptions(_eventListeners$i.optionsOrUseCapture)
            );
          }
        parentHostFiber.appendChild(temp);
        event = temp.dispatchEvent(event);
        if (eventListeners)
          for (i = 0; i < eventListeners.length; i++)
            _eventListeners$i = eventListeners[i], temp.removeEventListener(
              _eventListeners$i.type,
              _eventListeners$i.attachedListener,
              getAttachOptions(_eventListeners$i.optionsOrUseCapture)
            );
        parentHostFiber.removeChild(temp);
        return event;
      }
      return parentHostFiber.dispatchEvent(event);
    };
    FragmentInstance.prototype.focus = function(focusOptions) {
      traverseVisibleInstancesAndTextInstances(
        this._fragmentFiber.child,
        true,
        setFocusOnFiberIfFocusable,
        focusOptions,
        void 0,
        void 0
      );
    };
    function setFocusOnFiberIfFocusable(fiber, focusOptions) {
      if (6 === fiber.tag) return false;
      fiber = getInstanceFromHostFiber(fiber);
      return setFocusIfFocusable(fiber, focusOptions);
    }
    FragmentInstance.prototype.focusLast = function(focusOptions) {
      var children = [];
      traverseVisibleInstancesAndTextInstances(
        this._fragmentFiber.child,
        true,
        collectChildren,
        children,
        void 0,
        void 0
      );
      for (var i = children.length - 1; 0 <= i && !setFocusOnFiberIfFocusable(children[i], focusOptions); i--) ;
    };
    function collectChildren(child, collection) {
      collection.push(child);
      return false;
    }
    FragmentInstance.prototype.blur = function() {
      var parentHostFiber = getFragmentParentInstanceOrContainerFiber(
        this._fragmentFiber
      );
      null !== parentHostFiber && (parentHostFiber = getInstanceFromHostFiber(parentHostFiber), parentHostFiber = getOwnerDocumentFromRootContainer(parentHostFiber).activeElement, null !== parentHostFiber && traverseVisibleInstancesAndTextInstances(
        this._fragmentFiber.child,
        false,
        blurActiveElementWithinFragment,
        parentHostFiber,
        void 0,
        void 0
      ));
    };
    function blurActiveElementWithinFragment(child, activeElement2) {
      if (6 === child.tag) return false;
      child = getInstanceFromHostFiber(child);
      return child === activeElement2 || child.contains(activeElement2) ? (activeElement2.blur(), true) : false;
    }
    FragmentInstance.prototype.observeUsing = function(observer) {
      null === this._observers && (this._observers = /* @__PURE__ */ new Set());
      this._observers.add(observer);
      traverseVisibleInstancesAndTextInstances(
        this._fragmentFiber.child,
        false,
        observeChild,
        observer,
        void 0,
        void 0
      );
    };
    function observeChild(child, observer) {
      if (6 === child.tag) return false;
      child = getInstanceFromHostFiber(child);
      observer.observe(child);
      return false;
    }
    FragmentInstance.prototype.unobserveUsing = function(observer) {
      var observers = this._observers;
      if (null !== observers && observers.has(observer)) {
        observers.delete(observer);
        traverseVisibleInstancesAndTextInstances(
          this._fragmentFiber.child,
          false,
          unobserveChild,
          observer,
          void 0,
          void 0
        );
        for (var i = observers = 0; i < pendingIntersectionUnobserves.length; i++) {
          var pending = pendingIntersectionUnobserves[i];
          pending.fragmentInstance === this && pending.observer === observer ? observer.unobserve(pending.instance) : pendingIntersectionUnobserves[observers++] = pending;
        }
        pendingIntersectionUnobserves.length = observers;
      }
    };
    function unobserveChild(child, observer) {
      if (6 === child.tag) return false;
      child = getInstanceFromHostFiber(child);
      observer.unobserve(child);
      return false;
    }
    var pendingIntersectionUnobserves = [];
    var intersectionUnobserveScheduled = false;
    function schedulePendingIntersectionUnobserve(fragmentInstance, observer, instance) {
      pendingIntersectionUnobserves.push({
        fragmentInstance,
        observer,
        instance
      });
      intersectionUnobserveScheduled || (intersectionUnobserveScheduled = true, requestPostPaintCallback(function() {
        intersectionUnobserveScheduled = false;
        var pending = pendingIntersectionUnobserves;
        pendingIntersectionUnobserves = [];
        for (var i = 0; i < pending.length; i++) {
          var item = pending[i];
          item.observer.unobserve(item.instance);
        }
      }));
    }
    FragmentInstance.prototype.getClientRects = function() {
      var rects = [];
      traverseVisibleInstancesAndTextInstances(
        this._fragmentFiber.child,
        false,
        collectClientRects,
        rects,
        void 0,
        void 0
      );
      return rects;
    };
    function collectClientRects(child, rects) {
      if (6 === child.tag) {
        child = child.stateNode;
        var range = child.ownerDocument.createRange();
        range.selectNodeContents(child);
        rects.push.apply(rects, range.getClientRects());
      } else
        child = getInstanceFromHostFiber(child), rects.push.apply(rects, child.getClientRects());
      return false;
    }
    FragmentInstance.prototype.getRootNode = function(getRootNodeOptions) {
      var parentHostFiber = getFragmentParentInstanceOrContainerFiber(
        this._fragmentFiber
      );
      return null === parentHostFiber ? this : getInstanceFromHostFiber(parentHostFiber).getRootNode(getRootNodeOptions);
    };
    FragmentInstance.prototype.compareDocumentPosition = function(otherNode) {
      var parentHostFiber = getFragmentParentInstanceOrContainerFiber(
        this._fragmentFiber
      );
      if (null === parentHostFiber) return Node.DOCUMENT_POSITION_DISCONNECTED;
      var children = [];
      traverseVisibleInstancesAndTextInstances(
        this._fragmentFiber.child,
        false,
        collectChildren,
        children,
        void 0,
        void 0
      );
      var parentHostInstance = getInstanceFromHostFiber(parentHostFiber);
      if (0 === children.length) {
        children = parentHostInstance;
        if (fiberIsPortaledIntoHost(this._fragmentFiber)) {
          a: {
            for (parentHostFiber = this._fragmentFiber.return; null !== parentHostFiber; ) {
              if (4 === parentHostFiber.tag) {
                parentHostFiber = parentHostFiber.stateNode.containerInfo;
                break a;
              }
              if (3 === parentHostFiber.tag || 5 === parentHostFiber.tag || 27 === parentHostFiber.tag)
                break;
              parentHostFiber = parentHostFiber.return;
            }
            parentHostFiber = null;
          }
          null != parentHostFiber && (children = parentHostFiber);
        }
        parentHostFiber = this._fragmentFiber;
        var result = parentHostInstance = children.compareDocumentPosition(otherNode);
        children === otherNode ? result = Node.DOCUMENT_POSITION_CONTAINS : parentHostInstance & Node.DOCUMENT_POSITION_CONTAINED_BY && (children = getFragmentInstanceOrTextInstanceSiblings(parentHostFiber)[1], null === children ? result = Node.DOCUMENT_POSITION_PRECEDING : (otherNode = getInstanceFromHostFiber(children).compareDocumentPosition(
          otherNode
        ), result = 0 === otherNode || otherNode & Node.DOCUMENT_POSITION_FOLLOWING ? Node.DOCUMENT_POSITION_FOLLOWING : Node.DOCUMENT_POSITION_PRECEDING));
        return result |= Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
      }
      parentHostFiber = getInstanceFromHostFiber(children[0]);
      result = getInstanceFromHostFiber(children[children.length - 1]);
      var parentHostInstanceFromDOM = fiberIsPortaledIntoHost(this._fragmentFiber) ? parentHostFiber.parentElement : parentHostInstance;
      if (null == parentHostInstanceFromDOM)
        return Node.DOCUMENT_POSITION_DISCONNECTED;
      parentHostInstance = parentHostInstanceFromDOM.compareDocumentPosition(parentHostFiber) & Node.DOCUMENT_POSITION_CONTAINED_BY;
      parentHostInstanceFromDOM = parentHostInstanceFromDOM.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_CONTAINED_BY;
      var firstResult = parentHostFiber.compareDocumentPosition(otherNode), lastResult = result.compareDocumentPosition(otherNode), otherNodeIsWithinFirstOrLastChild = firstResult & Node.DOCUMENT_POSITION_CONTAINED_BY || lastResult & Node.DOCUMENT_POSITION_CONTAINED_BY;
      lastResult = parentHostInstance && parentHostInstanceFromDOM && firstResult & Node.DOCUMENT_POSITION_FOLLOWING && lastResult & Node.DOCUMENT_POSITION_PRECEDING;
      parentHostFiber = parentHostInstance && parentHostFiber === otherNode || parentHostInstanceFromDOM && result === otherNode || otherNodeIsWithinFirstOrLastChild || lastResult ? Node.DOCUMENT_POSITION_CONTAINED_BY : !parentHostInstance && parentHostFiber === otherNode || !parentHostInstanceFromDOM && result === otherNode ? Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC : firstResult;
      return parentHostFiber & Node.DOCUMENT_POSITION_DISCONNECTED || parentHostFiber & Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC || validateDocumentPositionWithFiberTree(
        parentHostFiber,
        this._fragmentFiber,
        children[0],
        children[children.length - 1],
        otherNode
      ) ? parentHostFiber : Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
    };
    function validateDocumentPositionWithFiberTree(documentPosition, fragmentFiber, precedingBoundaryFiber, followingBoundaryFiber, otherNode) {
      var otherFiber = getClosestInstanceFromNode(otherNode);
      if (documentPosition & Node.DOCUMENT_POSITION_CONTAINED_BY) {
        if (precedingBoundaryFiber = !!otherFiber)
          a: {
            for (; null !== otherFiber; ) {
              if (7 === otherFiber.tag && (otherFiber === fragmentFiber || otherFiber.alternate === fragmentFiber)) {
                precedingBoundaryFiber = true;
                break a;
              }
              otherFiber = otherFiber.return;
            }
            precedingBoundaryFiber = false;
          }
        return precedingBoundaryFiber;
      }
      if (documentPosition & Node.DOCUMENT_POSITION_CONTAINS) {
        if (null === otherFiber)
          return otherFiber = otherNode.ownerDocument, otherNode === otherFiber || otherNode === otherFiber.documentElement || otherNode === otherFiber.body;
        a: {
          otherFiber = fragmentFiber;
          for (fragmentFiber = getFragmentParentInstanceOrContainerFiber(fragmentFiber); null !== otherFiber; ) {
            if (!(5 !== otherFiber.tag && 3 !== otherFiber.tag && 27 !== otherFiber.tag || otherFiber !== fragmentFiber && otherFiber.alternate !== fragmentFiber)) {
              otherFiber = true;
              break a;
            }
            otherFiber = otherFiber.return;
          }
          otherFiber = false;
        }
        return otherFiber;
      }
      return documentPosition & Node.DOCUMENT_POSITION_PRECEDING ? ((fragmentFiber = !!otherFiber) && !(fragmentFiber = otherFiber === precedingBoundaryFiber) && (fragmentFiber = getLowestCommonAncestor(
        precedingBoundaryFiber,
        otherFiber,
        getParentForFragmentAncestors
      ), null === fragmentFiber ? fragmentFiber = false : (traverseVisibleInstancesAndTextInstances(
        fragmentFiber,
        true,
        isFiberPrecedingCheck,
        otherFiber,
        precedingBoundaryFiber
      ), otherFiber = searchTarget, searchTarget = null, fragmentFiber = null !== otherFiber)), fragmentFiber) : documentPosition & Node.DOCUMENT_POSITION_FOLLOWING ? ((fragmentFiber = !!otherFiber) && !(fragmentFiber = otherFiber === followingBoundaryFiber) && (fragmentFiber = getLowestCommonAncestor(
        followingBoundaryFiber,
        otherFiber,
        getParentForFragmentAncestors
      ), null === fragmentFiber ? fragmentFiber = false : (traverseVisibleInstancesAndTextInstances(
        fragmentFiber,
        true,
        isFiberFollowingCheck,
        otherFiber,
        followingBoundaryFiber
      ), otherFiber = searchTarget, searchBoundary = searchTarget = null, fragmentFiber = null !== otherFiber)), fragmentFiber) : false;
    }
    function scrollTextNodeIntoView(textNode, resolvedAlignToTop) {
      var range = textNode.ownerDocument.createRange();
      range.selectNodeContents(textNode);
      textNode = range.getBoundingClientRect();
      window.scrollTo(
        window.scrollX + textNode.left,
        resolvedAlignToTop ? window.scrollY + textNode.top : window.scrollY + textNode.bottom - window.innerHeight
      );
    }
    FragmentInstance.prototype.scrollIntoView = function(alignToTop) {
      if ("object" === typeof alignToTop) throw Error(formatProdErrorMessage(566));
      var children = [];
      traverseVisibleInstancesAndTextInstances(
        this._fragmentFiber.child,
        false,
        collectChildren,
        children,
        void 0,
        void 0
      );
      var resolvedAlignToTop = false !== alignToTop;
      if (0 === children.length) {
        var hostSiblings = getFragmentInstanceOrTextInstanceSiblings(
          this._fragmentFiber
        );
        hostSiblings = resolvedAlignToTop ? hostSiblings[1] || hostSiblings[0] || getFragmentParentInstanceOrContainerFiber(this._fragmentFiber) : hostSiblings[0] || hostSiblings[1];
        if (null === hostSiblings) return;
        if (6 === hostSiblings.tag) {
          alignToTop = getInstanceFromHostFiber(hostSiblings);
          scrollTextNodeIntoView(alignToTop, resolvedAlignToTop);
          return;
        }
        hostSiblings = getInstanceFromHostFiber(hostSiblings);
        if (9 !== hostSiblings.nodeType) {
          if (11 === hostSiblings.nodeType) {
            resolvedAlignToTop = "host" in hostSiblings ? hostSiblings.host : null;
            null !== resolvedAlignToTop && resolvedAlignToTop.scrollIntoView(alignToTop);
            return;
          }
          hostSiblings.scrollIntoView(alignToTop);
        }
      }
      for (hostSiblings = resolvedAlignToTop ? children.length - 1 : 0; hostSiblings !== (resolvedAlignToTop ? -1 : children.length); ) {
        var child = children[hostSiblings];
        6 === child.tag ? (child = getInstanceFromHostFiber(child), scrollTextNodeIntoView(child, resolvedAlignToTop)) : getInstanceFromHostFiber(child).scrollIntoView(alignToTop);
        hostSiblings += resolvedAlignToTop ? -1 : 1;
      }
    };
    function addFragmentHandleToFiber(child, fragmentInstance) {
      child = getInstanceFromHostFiber(child);
      addFragmentHandleToInstance(child, fragmentInstance);
      return false;
    }
    function addFragmentHandleToInstance(instance, fragmentInstance) {
      null == instance.reactFragments && (instance.reactFragments = /* @__PURE__ */ new Set());
      instance.reactFragments.add(fragmentInstance);
    }
    function commitNewChildToFragmentInstance(childInstance, fragmentInstance) {
      var eventListeners = fragmentInstance._eventListeners;
      if (null !== eventListeners)
        for (var i$jscomp$0 = 0; i$jscomp$0 < eventListeners.length; i$jscomp$0++) {
          var _eventListeners$i3 = eventListeners[i$jscomp$0];
          childInstance.addEventListener(
            _eventListeners$i3.type,
            _eventListeners$i3.attachedListener,
            getAttachOptions(_eventListeners$i3.optionsOrUseCapture)
          );
        }
      3 !== childInstance.nodeType && (eventListeners = fragmentInstance._observers, null !== eventListeners && eventListeners.forEach(function(observer) {
        for (var writeIdx = 0, i = 0; i < pendingIntersectionUnobserves.length; i++) {
          var pending = pendingIntersectionUnobserves[i];
          if (pending.fragmentInstance !== fragmentInstance || pending.observer !== observer || pending.instance !== childInstance)
            pendingIntersectionUnobserves[writeIdx++] = pending;
        }
        pendingIntersectionUnobserves.length = writeIdx;
        observer.observe(childInstance);
      }), addFragmentHandleToInstance(childInstance, fragmentInstance));
    }
    function deleteChildFromFragmentInstance(childInstance, fragmentInstance) {
      var eventListeners = fragmentInstance._eventListeners;
      if (null !== eventListeners)
        for (var i = 0; i < eventListeners.length; i++) {
          var _eventListeners$i4 = eventListeners[i];
          childInstance.removeEventListener(
            _eventListeners$i4.type,
            _eventListeners$i4.attachedListener,
            getAttachOptions(_eventListeners$i4.optionsOrUseCapture)
          );
        }
      3 !== childInstance.nodeType && (eventListeners = fragmentInstance._observers, null !== eventListeners && eventListeners.forEach(function(observer) {
        "string" === typeof observer.rootMargin ? schedulePendingIntersectionUnobserve(
          fragmentInstance,
          observer,
          childInstance
        ) : observer.unobserve(childInstance);
      }), null != childInstance.reactFragments && childInstance.reactFragments.delete(fragmentInstance));
    }
    function clearContainerSparingly(container) {
      var nextNode = container.firstChild;
      nextNode && 10 === nextNode.nodeType && (nextNode = nextNode.nextSibling);
      for (; nextNode; ) {
        var node = nextNode;
        nextNode = nextNode.nextSibling;
        switch (node.nodeName) {
          case "HTML":
          case "HEAD":
          case "BODY":
            clearContainerSparingly(node);
            detachDeletedInstance(node);
            continue;
          case "SCRIPT":
          case "STYLE":
            continue;
          case "LINK":
            if ("stylesheet" === node.rel.toLowerCase()) continue;
        }
        container.removeChild(node);
      }
    }
    function canHydrateInstance(instance, type, props, inRootOrSingleton) {
      for (; 1 === instance.nodeType; ) {
        var anyProps = props;
        if (instance.nodeName.toLowerCase() !== type.toLowerCase()) {
          if (!inRootOrSingleton && ("INPUT" !== instance.nodeName || "hidden" !== instance.type))
            break;
        } else if (!inRootOrSingleton)
          if ("input" === type && "hidden" === instance.type) {
            var name = null == anyProps.name ? null : "" + anyProps.name;
            if ("hidden" === anyProps.type && instance.getAttribute("name") === name)
              return instance;
          } else return instance;
        else if (!instance[internalHoistableMarker])
          switch (type) {
            case "meta":
              if (!instance.hasAttribute("itemprop")) break;
              return instance;
            case "link":
              name = instance.getAttribute("rel");
              if ("stylesheet" === name && instance.hasAttribute("data-precedence"))
                break;
              else if (name !== anyProps.rel || instance.getAttribute("href") !== (null == anyProps.href || "" === anyProps.href ? null : anyProps.href) || instance.getAttribute("crossorigin") !== (null == anyProps.crossOrigin ? null : anyProps.crossOrigin) || instance.getAttribute("title") !== (null == anyProps.title ? null : anyProps.title))
                break;
              return instance;
            case "style":
              if (instance.hasAttribute("data-precedence")) break;
              return instance;
            case "script":
              name = instance.getAttribute("src");
              if ((name !== (null == anyProps.src ? null : anyProps.src) || instance.getAttribute("type") !== (null == anyProps.type ? null : anyProps.type) || instance.getAttribute("crossorigin") !== (null == anyProps.crossOrigin ? null : anyProps.crossOrigin)) && name && instance.hasAttribute("async") && !instance.hasAttribute("itemprop"))
                break;
              return instance;
            default:
              return instance;
          }
        instance = getNextHydratable(instance.nextSibling);
        if (null === instance) break;
      }
      return null;
    }
    function canHydrateTextInstance(instance, text, inRootOrSingleton) {
      if ("" === text) return null;
      for (; 3 !== instance.nodeType; ) {
        if ((1 !== instance.nodeType || "INPUT" !== instance.nodeName || "hidden" !== instance.type) && !inRootOrSingleton)
          return null;
        instance = getNextHydratable(instance.nextSibling);
        if (null === instance) return null;
      }
      return instance;
    }
    function canHydrateHydrationBoundary(instance, inRootOrSingleton) {
      for (; 8 !== instance.nodeType; ) {
        if ((1 !== instance.nodeType || "INPUT" !== instance.nodeName || "hidden" !== instance.type) && !inRootOrSingleton)
          return null;
        instance = getNextHydratable(instance.nextSibling);
        if (null === instance) return null;
      }
      return instance;
    }
    function isSuspenseInstancePending(instance) {
      return "$?" === instance.data || "$~" === instance.data;
    }
    function isSuspenseInstanceFallback(instance) {
      return "$!" === instance.data || "$?" === instance.data && "loading" !== instance.ownerDocument.readyState;
    }
    function registerSuspenseInstanceRetry(instance, callback) {
      var ownerDocument = instance.ownerDocument;
      if ("$~" === instance.data) instance._reactRetry = callback;
      else if ("$?" !== instance.data || "loading" !== ownerDocument.readyState)
        callback();
      else {
        var listener = function() {
          callback();
          ownerDocument.removeEventListener("DOMContentLoaded", listener);
        };
        ownerDocument.addEventListener("DOMContentLoaded", listener);
        instance._reactRetry = listener;
      }
    }
    function getNextHydratable(node) {
      for (; null != node; node = node.nextSibling) {
        var nodeType = node.nodeType;
        if (1 === nodeType || 3 === nodeType) break;
        if (8 === nodeType) {
          nodeType = node.data;
          if ("$" === nodeType || "$!" === nodeType || "$?" === nodeType || "$~" === nodeType || "&" === nodeType || "F!" === nodeType || "F" === nodeType)
            break;
          if ("/$" === nodeType || "/&" === nodeType) return null;
        }
      }
      return node;
    }
    var previousHydratableOnEnteringScopedSingleton = null;
    function getNextHydratableInstanceAfterHydrationBoundary(hydrationInstance) {
      hydrationInstance = hydrationInstance.nextSibling;
      for (var depth = 0; hydrationInstance; ) {
        if (8 === hydrationInstance.nodeType) {
          var data = hydrationInstance.data;
          if ("/$" === data || "/&" === data) {
            if (0 === depth)
              return getNextHydratable(hydrationInstance.nextSibling);
            depth--;
          } else
            "$" !== data && "$!" !== data && "$?" !== data && "$~" !== data && "&" !== data || depth++;
        }
        hydrationInstance = hydrationInstance.nextSibling;
      }
      return null;
    }
    function getParentHydrationBoundary(targetInstance) {
      targetInstance = targetInstance.previousSibling;
      for (var depth = 0; targetInstance; ) {
        if (8 === targetInstance.nodeType) {
          var data = targetInstance.data;
          if ("$" === data || "$!" === data || "$?" === data || "$~" === data || "&" === data) {
            if (0 === depth) return targetInstance;
            depth--;
          } else "/$" !== data && "/&" !== data || depth++;
        }
        targetInstance = targetInstance.previousSibling;
      }
      return null;
    }
    function setFocusIfFocusable(node, focusOptions) {
      function handleFocus() {
        didFocus = true;
      }
      if (node.ownerDocument.activeElement === node) return true;
      var didFocus = false;
      try {
        node.ownerDocument.addEventListener("focus", handleFocus, true), (node.focus || HTMLElement.prototype.focus).call(node, focusOptions);
      } finally {
        node.ownerDocument.removeEventListener("focus", handleFocus, true);
      }
      return didFocus;
    }
    function requestPostPaintCallback(callback) {
      localRequestAnimationFrame(function() {
        localRequestAnimationFrame(function(time) {
          return callback(time);
        });
      });
    }
    function resolveSingletonInstance(type, props, rootContainerInstance) {
      props = getOwnerDocumentFromRootContainer(rootContainerInstance);
      switch (type) {
        case "html":
          type = props.documentElement;
          if (!type) throw Error(formatProdErrorMessage(452));
          return type;
        case "head":
          type = props.head;
          if (!type) throw Error(formatProdErrorMessage(453));
          return type;
        case "body":
          type = props.body;
          if (!type) throw Error(formatProdErrorMessage(454));
          return type;
        default:
          throw Error(formatProdErrorMessage(451));
      }
    }
    function releaseSingletonInstance(instance, type, props) {
      for (var propKey in props) {
        var propValue = props[propKey];
        props.hasOwnProperty(propKey) && null != propValue && setProp(instance, type, propKey, null, emptyProps, propValue);
      }
      null != props.dangerouslySetInnerHTML && (instance.textContent = "");
      instance.onclick === noop$1 && (instance.onclick = null);
      detachDeletedInstance(instance);
    }
    function clearSingletonPreambleContribution(instance) {
      for (var attributes = instance.attributes; attributes.length; )
        instance.removeAttributeNode(attributes[0]);
      detachDeletedInstance(instance);
    }
    var preloadPropsMap = /* @__PURE__ */ new Map();
    var preconnectsSet = /* @__PURE__ */ new Set();
    function getHoistableRoot(container) {
      if ("function" === typeof container.getRootNode) {
        var rootNode = container.getRootNode();
        if (9 === rootNode.nodeType || 11 === rootNode.nodeType) return rootNode;
      }
      return 9 === container.nodeType ? container : container.ownerDocument;
    }
    var previousDispatcher = ReactDOMSharedInternals.d;
    ReactDOMSharedInternals.d = {
      f: flushSyncWork,
      r: requestFormReset,
      D: prefetchDNS,
      C: preconnect,
      L: preload,
      m: preloadModule,
      X: preinitScript,
      S: preinitStyle,
      M: preinitModuleScript
    };
    function flushSyncWork() {
      var previousWasRendering = previousDispatcher.f(), wasRendering = flushSyncWork$1();
      return previousWasRendering || wasRendering;
    }
    function requestFormReset(form) {
      var formInst = getInstanceFromNode(form);
      null !== formInst && 5 === formInst.tag && "form" === formInst.type ? requestFormReset$1(formInst) : previousDispatcher.r(form);
    }
    var globalDocument = "undefined" === typeof document ? null : document;
    function preconnectAs(rel, href, crossOrigin) {
      var ownerDocument = globalDocument;
      if (ownerDocument && "string" === typeof href && href) {
        var limitedEscapedHref = escapeSelectorAttributeValueInsideDoubleQuotes(href);
        limitedEscapedHref = 'link[rel="' + rel + '"][href="' + limitedEscapedHref + '"]';
        "string" === typeof crossOrigin && (limitedEscapedHref += '[crossorigin="' + crossOrigin + '"]');
        preconnectsSet.has(limitedEscapedHref) || (preconnectsSet.add(limitedEscapedHref), rel = { rel, crossOrigin, href }, null === ownerDocument.querySelector(limitedEscapedHref) && (href = ownerDocument.createElement("link"), setInitialProperties(href, "link", rel), markNodeAsHoistable(href), ownerDocument.head.appendChild(href)));
      }
    }
    function prefetchDNS(href) {
      previousDispatcher.D(href);
      preconnectAs("dns-prefetch", href, null);
    }
    function preconnect(href, crossOrigin) {
      previousDispatcher.C(href, crossOrigin);
      preconnectAs("preconnect", href, crossOrigin);
    }
    function preload(href, as, options2) {
      previousDispatcher.L(href, as, options2);
      var ownerDocument = globalDocument;
      if (ownerDocument && href && as) {
        var preloadSelector = 'link[rel="preload"][as="' + escapeSelectorAttributeValueInsideDoubleQuotes(as) + '"]';
        "image" === as ? options2 && options2.imageSrcSet ? (preloadSelector += '[imagesrcset="' + escapeSelectorAttributeValueInsideDoubleQuotes(
          options2.imageSrcSet
        ) + '"]', "string" === typeof options2.imageSizes && (preloadSelector += '[imagesizes="' + escapeSelectorAttributeValueInsideDoubleQuotes(
          options2.imageSizes
        ) + '"]')) : preloadSelector += '[href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]' : preloadSelector += '[href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]';
        var key2 = preloadSelector;
        switch (as) {
          case "style":
            key2 = getStyleKey(href);
            break;
          case "script":
            key2 = getScriptKey(href);
        }
        if (!(preloadPropsMap.has(key2) || (href = assign(
          {
            rel: "preload",
            href: "image" === as && options2 && options2.imageSrcSet ? void 0 : href,
            as
          },
          options2
        ), preloadPropsMap.set(key2, href), null !== ownerDocument.querySelector(preloadSelector) || "style" === as && ownerDocument.querySelector(getStylesheetSelectorFromKey(key2)) || "script" === as && ownerDocument.querySelector(getScriptSelectorFromKey(key2))))) {
          var instance = ownerDocument.createElement("link");
          setInitialProperties(instance, "link", href);
          "style" === as && (instance[internalLoadPendingKey] = true, instance.onload = instance.onerror = function() {
            clearPendingLoadOnNode(instance);
          });
          markNodeAsHoistable(instance);
          ownerDocument.head.appendChild(instance);
        }
      }
    }
    function preloadModule(href, options2) {
      previousDispatcher.m(href, options2);
      var ownerDocument = globalDocument;
      if (ownerDocument && href) {
        var as = options2 && "string" === typeof options2.as ? options2.as : "script", preloadSelector = 'link[rel="modulepreload"][as="' + escapeSelectorAttributeValueInsideDoubleQuotes(as) + '"][href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]', key2 = preloadSelector;
        switch (as) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            key2 = getScriptKey(href);
        }
        if (!preloadPropsMap.has(key2) && (href = assign({ rel: "modulepreload", href }, options2), preloadPropsMap.set(key2, href), null === ownerDocument.querySelector(preloadSelector))) {
          switch (as) {
            case "audioworklet":
            case "paintworklet":
            case "serviceworker":
            case "sharedworker":
            case "worker":
            case "script":
              if (ownerDocument.querySelector(getScriptSelectorFromKey(key2)))
                return;
          }
          as = ownerDocument.createElement("link");
          setInitialProperties(as, "link", href);
          markNodeAsHoistable(as);
          ownerDocument.head.appendChild(as);
        }
      }
    }
    function preinitStyle(href, precedence, options2) {
      previousDispatcher.S(href, precedence, options2);
      var ownerDocument = globalDocument;
      if (ownerDocument && href) {
        var styles = getResourcesFromRoot(ownerDocument).hoistableStyles, key2 = getStyleKey(href);
        precedence = precedence || "default";
        var resource = styles.get(key2);
        if (!resource) {
          var state = { loading: 0, preload: null };
          if (resource = ownerDocument.querySelector(
            getStylesheetSelectorFromKey(key2)
          ))
            state.loading = 5;
          else {
            href = assign(
              { rel: "stylesheet", href, "data-precedence": precedence },
              options2
            );
            (options2 = preloadPropsMap.get(key2)) && adoptPreloadPropsForStylesheet(href, options2);
            var link = resource = ownerDocument.createElement("link");
            markNodeAsHoistable(link);
            setInitialProperties(link, "link", href);
            link._p = new Promise(function(resolve, reject) {
              link.onload = resolve;
              link.onerror = reject;
            });
            link.addEventListener("load", function() {
              state.loading |= 1;
            });
            link.addEventListener("error", function() {
              state.loading |= 2;
            });
            state.loading |= 4;
            insertStylesheet(resource, precedence, ownerDocument);
          }
          resource = {
            type: "stylesheet",
            instance: resource,
            count: 1,
            state
          };
          styles.set(key2, resource);
        }
      }
    }
    function preinitScript(src, options2) {
      previousDispatcher.X(src, options2);
      var ownerDocument = globalDocument;
      if (ownerDocument && src) {
        var scripts = getResourcesFromRoot(ownerDocument).hoistableScripts, key2 = getScriptKey(src), resource = scripts.get(key2);
        resource || (resource = ownerDocument.querySelector(getScriptSelectorFromKey(key2)), resource || (src = assign({ src, async: true }, options2), (options2 = preloadPropsMap.get(key2)) && adoptPreloadPropsForScript(src, options2), resource = ownerDocument.createElement("script"), markNodeAsHoistable(resource), setInitialProperties(resource, "link", src), ownerDocument.head.appendChild(resource)), resource = {
          type: "script",
          instance: resource,
          count: 1,
          state: null
        }, scripts.set(key2, resource));
      }
    }
    function preinitModuleScript(src, options2) {
      previousDispatcher.M(src, options2);
      var ownerDocument = globalDocument;
      if (ownerDocument && src) {
        var scripts = getResourcesFromRoot(ownerDocument).hoistableScripts, key2 = getScriptKey(src), resource = scripts.get(key2);
        resource || (resource = ownerDocument.querySelector(getScriptSelectorFromKey(key2)), resource || (src = assign({ src, async: true, type: "module" }, options2), (options2 = preloadPropsMap.get(key2)) && adoptPreloadPropsForScript(src, options2), resource = ownerDocument.createElement("script"), markNodeAsHoistable(resource), setInitialProperties(resource, "link", src), ownerDocument.head.appendChild(resource)), resource = {
          type: "script",
          instance: resource,
          count: 1,
          state: null
        }, scripts.set(key2, resource));
      }
    }
    function getResource(type, currentProps, pendingProps, currentResource) {
      var JSCompiler_inline_result = (JSCompiler_inline_result = rootInstanceStackCursor.current) ? getHoistableRoot(JSCompiler_inline_result) : null;
      if (!JSCompiler_inline_result) throw Error(formatProdErrorMessage(446));
      switch (type) {
        case "meta":
        case "title":
          return null;
        case "style":
          return "string" === typeof pendingProps.precedence && "string" === typeof pendingProps.href ? (pendingProps = getStyleKey(pendingProps.href), currentProps = getResourcesFromRoot(
            JSCompiler_inline_result
          ).hoistableStyles, currentResource = currentProps.get(pendingProps), currentResource || (currentResource = {
            type: "style",
            instance: null,
            count: 0,
            state: null
          }, currentProps.set(pendingProps, currentResource)), currentResource) : { type: "void", instance: null, count: 0, state: null };
        case "link":
          if ("stylesheet" === pendingProps.rel && "string" === typeof pendingProps.href && "string" === typeof pendingProps.precedence) {
            type = getStyleKey(pendingProps.href);
            var styles$268 = getResourcesFromRoot(
              JSCompiler_inline_result
            ).hoistableStyles, resource$269 = styles$268.get(type);
            resource$269 || (JSCompiler_inline_result = JSCompiler_inline_result.ownerDocument || JSCompiler_inline_result, resource$269 = {
              type: "stylesheet",
              instance: null,
              count: 0,
              state: { loading: 0, preload: null }
            }, styles$268.set(type, resource$269), (styles$268 = JSCompiler_inline_result.querySelector(
              getStylesheetSelectorFromKey(type)
            )) ? styles$268._p || (resource$269.instance = styles$268, resource$269.state.loading = 5) : (styles$268 = preloadPropsMap.get(type), styles$268 || (styles$268 = {
              rel: "preload",
              as: "style",
              href: pendingProps.href,
              crossOrigin: pendingProps.crossOrigin,
              integrity: pendingProps.integrity,
              media: pendingProps.media,
              hrefLang: pendingProps.hrefLang,
              referrerPolicy: pendingProps.referrerPolicy
            }, preloadPropsMap.set(type, styles$268)), preloadStylesheet(
              JSCompiler_inline_result,
              type,
              styles$268,
              resource$269.state
            )));
            if (currentProps && null === currentResource)
              throw Error(formatProdErrorMessage(528, ""));
            return resource$269;
          }
          if (currentProps && null !== currentResource)
            throw Error(formatProdErrorMessage(529, ""));
          return null;
        case "script":
          return currentProps = pendingProps.async, pendingProps = pendingProps.src, "string" === typeof pendingProps && currentProps && "function" !== typeof currentProps && "symbol" !== typeof currentProps ? (pendingProps = getScriptKey(pendingProps), currentProps = getResourcesFromRoot(
            JSCompiler_inline_result
          ).hoistableScripts, currentResource = currentProps.get(pendingProps), currentResource || (currentResource = {
            type: "script",
            instance: null,
            count: 0,
            state: null
          }, currentProps.set(pendingProps, currentResource)), currentResource) : { type: "void", instance: null, count: 0, state: null };
        default:
          throw Error(formatProdErrorMessage(444, type));
      }
    }
    function getStyleKey(href) {
      return 'href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"';
    }
    function getStylesheetSelectorFromKey(key2) {
      return 'link[rel="stylesheet"][' + key2 + "]";
    }
    function stylesheetPropsFromRawProps(rawProps) {
      return assign({}, rawProps, {
        "data-precedence": rawProps.precedence,
        precedence: null
      });
    }
    function preloadStylesheet(ownerDocument, key2, preloadProps, state) {
      if (key2 = ownerDocument.querySelector(
        'link[rel="preload"][as="style"][' + key2 + "]"
      )) {
        if (true !== key2[internalLoadPendingKey]) {
          state.loading = 1;
          return;
        }
      } else
        key2 = ownerDocument.createElement("link"), key2[internalLoadPendingKey] = true, key2.onload = key2.onerror = clearPendingLoadOnNode.bind(null, key2), setInitialProperties(key2, "link", preloadProps), markNodeAsHoistable(key2), ownerDocument.head.appendChild(key2);
      state.preload = key2;
      key2.addEventListener("load", function() {
        return state.loading |= 1;
      });
      key2.addEventListener("error", function() {
        return state.loading |= 2;
      });
    }
    function getScriptKey(src) {
      return '[src="' + escapeSelectorAttributeValueInsideDoubleQuotes(src) + '"]';
    }
    function getScriptSelectorFromKey(key2) {
      return "script[async]" + key2;
    }
    function acquireResource(hoistableRoot, resource, props) {
      resource.count++;
      if (null === resource.instance)
        switch (resource.type) {
          case "style":
            var instance = hoistableRoot.querySelector(
              'style[data-href~="' + escapeSelectorAttributeValueInsideDoubleQuotes(props.href) + '"]'
            );
            if (instance)
              return resource.instance = instance, markNodeAsHoistable(instance), instance;
            var styleProps = assign({}, props, {
              "data-href": props.href,
              "data-precedence": props.precedence,
              href: null,
              precedence: null
            });
            instance = (hoistableRoot.ownerDocument || hoistableRoot).createElement(
              "style"
            );
            markNodeAsHoistable(instance);
            setInitialProperties(instance, "style", styleProps);
            insertStylesheet(instance, props.precedence, hoistableRoot);
            return resource.instance = instance;
          case "stylesheet":
            styleProps = getStyleKey(props.href);
            var instance$274 = hoistableRoot.querySelector(
              getStylesheetSelectorFromKey(styleProps)
            );
            if (instance$274)
              return resource.state.loading |= 4, resource.instance = instance$274, markNodeAsHoistable(instance$274), instance$274;
            instance = stylesheetPropsFromRawProps(props);
            (styleProps = preloadPropsMap.get(styleProps)) && adoptPreloadPropsForStylesheet(instance, styleProps);
            instance$274 = (hoistableRoot.ownerDocument || hoistableRoot).createElement("link");
            markNodeAsHoistable(instance$274);
            var linkInstance = instance$274;
            linkInstance._p = new Promise(function(resolve, reject) {
              linkInstance.onload = resolve;
              linkInstance.onerror = reject;
            });
            setInitialProperties(instance$274, "link", instance);
            resource.state.loading |= 4;
            insertStylesheet(instance$274, props.precedence, hoistableRoot);
            return resource.instance = instance$274;
          case "script":
            instance$274 = getScriptKey(props.src);
            if (styleProps = hoistableRoot.querySelector(
              getScriptSelectorFromKey(instance$274)
            ))
              return resource.instance = styleProps, markNodeAsHoistable(styleProps), styleProps;
            instance = props;
            if (styleProps = preloadPropsMap.get(instance$274))
              instance = assign({}, props), adoptPreloadPropsForScript(instance, styleProps);
            hoistableRoot = hoistableRoot.ownerDocument || hoistableRoot;
            styleProps = hoistableRoot.createElement("script");
            markNodeAsHoistable(styleProps);
            setInitialProperties(styleProps, "link", instance);
            hoistableRoot.head.appendChild(styleProps);
            return resource.instance = styleProps;
          case "void":
            return null;
          default:
            throw Error(formatProdErrorMessage(443, resource.type));
        }
      else
        "stylesheet" === resource.type && 0 === (resource.state.loading & 4) && (instance = resource.instance, resource.state.loading |= 4, insertStylesheet(instance, props.precedence, hoistableRoot));
      return resource.instance;
    }
    function insertStylesheet(instance, precedence, root2) {
      for (var nodes = root2.querySelectorAll(
        'link[rel="stylesheet"][data-precedence],style[data-precedence]'
      ), last = nodes.length ? nodes[nodes.length - 1] : null, prior = last, i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.dataset.precedence === precedence) prior = node;
        else if (prior !== last) break;
      }
      prior ? prior.parentNode.insertBefore(instance, prior.nextSibling) : (precedence = 9 === root2.nodeType ? root2.head : root2, precedence.insertBefore(instance, precedence.firstChild));
    }
    function adoptPreloadPropsForStylesheet(stylesheetProps, preloadProps) {
      null == stylesheetProps.crossOrigin && (stylesheetProps.crossOrigin = preloadProps.crossOrigin);
      null == stylesheetProps.referrerPolicy && (stylesheetProps.referrerPolicy = preloadProps.referrerPolicy);
      null == stylesheetProps.title && (stylesheetProps.title = preloadProps.title);
    }
    function adoptPreloadPropsForScript(scriptProps, preloadProps) {
      null == scriptProps.crossOrigin && (scriptProps.crossOrigin = preloadProps.crossOrigin);
      null == scriptProps.referrerPolicy && (scriptProps.referrerPolicy = preloadProps.referrerPolicy);
      null == scriptProps.integrity && (scriptProps.integrity = preloadProps.integrity);
    }
    var tagCaches = null;
    function getHydratableHoistableCache(type, keyAttribute, ownerDocument) {
      if (null === tagCaches) {
        var cache = /* @__PURE__ */ new Map();
        var caches = tagCaches = /* @__PURE__ */ new Map();
        caches.set(ownerDocument, cache);
      } else
        caches = tagCaches, cache = caches.get(ownerDocument), cache || (cache = /* @__PURE__ */ new Map(), caches.set(ownerDocument, cache));
      if (cache.has(type)) return cache;
      cache.set(type, null);
      ownerDocument = ownerDocument.getElementsByTagName(type);
      for (caches = 0; caches < ownerDocument.length; caches++) {
        var node = ownerDocument[caches];
        if (!(node[internalHoistableMarker] || node[internalInstanceKey] || "link" === type && "stylesheet" === node.getAttribute("rel")) && "http://www.w3.org/2000/svg" !== node.namespaceURI) {
          var nodeKey = node.getAttribute(keyAttribute) || "";
          nodeKey = type + nodeKey;
          var existing = cache.get(nodeKey);
          existing ? existing.push(node) : cache.set(nodeKey, [node]);
        }
      }
      return cache;
    }
    function mountHoistable(hoistableRoot, type, instance) {
      hoistableRoot = hoistableRoot.ownerDocument || hoistableRoot;
      hoistableRoot.head.insertBefore(
        instance,
        "title" === type ? hoistableRoot.querySelector("head > title") : null
      );
    }
    function isHostHoistableType(type, props, hostContext) {
      if (1 === hostContext || null != props.itemProp) return false;
      switch (type) {
        case "meta":
        case "title":
          return true;
        case "style":
          if ("string" !== typeof props.precedence || "string" !== typeof props.href || "" === props.href)
            break;
          return true;
        case "link":
          if ("string" !== typeof props.rel || "string" !== typeof props.href || "" === props.href || props.onLoad || props.onError)
            break;
          switch (props.rel) {
            case "stylesheet":
              return type = props.disabled, "string" === typeof props.precedence && null == type;
            default:
              return true;
          }
        case "script":
          if (props.async && "function" !== typeof props.async && "symbol" !== typeof props.async && !props.onLoad && !props.onError && props.src && "string" === typeof props.src)
            return true;
      }
      return false;
    }
    function maySuspendCommit(type, props) {
      return "img" === type && null != props.src && "" !== props.src && null == props.onLoad && "lazy" !== props.loading;
    }
    function preloadResource(resource) {
      return "stylesheet" === resource.type && 0 === (resource.state.loading & 3) ? false : true;
    }
    function estimateImageBytes(instance) {
      return (instance.width || 100) * (instance.height || 100) * ("number" === typeof devicePixelRatio ? devicePixelRatio : 1) * 0.25;
    }
    function suspendInstance(state, instance) {
      "function" === typeof instance.decode && (state.imgCount++, instance.complete || (state.imgBytes += estimateImageBytes(instance), state.suspenseyImages.push(instance)), state = onUnsuspendImg.bind(state), instance.decode().then(state, state));
    }
    function suspendResource(state, hoistableRoot, resource, props) {
      if ("stylesheet" === resource.type && ("string" !== typeof props.media || false !== matchMedia(props.media).matches) && 0 === (resource.state.loading & 4)) {
        if (null === resource.instance) {
          var key2 = getStyleKey(props.href), instance = hoistableRoot.querySelector(
            getStylesheetSelectorFromKey(key2)
          );
          if (instance) {
            hoistableRoot = instance._p;
            null !== hoistableRoot && "object" === typeof hoistableRoot && "function" === typeof hoistableRoot.then && (state.count++, state = onUnsuspend.bind(state), hoistableRoot.then(state, state));
            resource.state.loading |= 4;
            resource.instance = instance;
            markNodeAsHoistable(instance);
            return;
          }
          instance = hoistableRoot.ownerDocument || hoistableRoot;
          props = stylesheetPropsFromRawProps(props);
          (key2 = preloadPropsMap.get(key2)) && adoptPreloadPropsForStylesheet(props, key2);
          instance = instance.createElement("link");
          markNodeAsHoistable(instance);
          var linkInstance = instance;
          linkInstance._p = new Promise(function(resolve, reject) {
            linkInstance.onload = resolve;
            linkInstance.onerror = reject;
          });
          setInitialProperties(instance, "link", props);
          resource.instance = instance;
        }
        null === state.stylesheets && (state.stylesheets = /* @__PURE__ */ new Map());
        state.stylesheets.set(resource, hoistableRoot);
        (hoistableRoot = resource.state.preload) && 0 === (resource.state.loading & 3) && (state.count++, resource = onUnsuspend.bind(state), hoistableRoot.addEventListener("load", resource), hoistableRoot.addEventListener("error", resource));
      }
    }
    var estimatedBytesWithinLimit = 0;
    function waitForCommitToBeReady(state, timeoutOffset) {
      state.stylesheets && 0 === state.count && insertSuspendedStylesheets(state, state.stylesheets);
      return 0 < state.count || 0 < state.imgCount ? function(commit2) {
        var stylesheetTimer = setTimeout(function() {
          state.stylesheets && insertSuspendedStylesheets(state, state.stylesheets);
          if (state.unsuspend) {
            var unsuspend = state.unsuspend;
            state.unsuspend = null;
            unsuspend();
          }
        }, 6e4 + timeoutOffset);
        0 < state.imgBytes && 0 === estimatedBytesWithinLimit && (estimatedBytesWithinLimit = 62500 * estimateBandwidth());
        var imgTimer = setTimeout(
          function() {
            state.waitingForImages = false;
            if (0 === state.count && (state.stylesheets && insertSuspendedStylesheets(state, state.stylesheets), state.unsuspend)) {
              var unsuspend = state.unsuspend;
              state.unsuspend = null;
              unsuspend();
            }
          },
          (state.imgBytes > estimatedBytesWithinLimit ? 50 : 800) + timeoutOffset
        );
        state.unsuspend = commit2;
        return function() {
          state.unsuspend = null;
          clearTimeout(stylesheetTimer);
          clearTimeout(imgTimer);
        };
      } : null;
    }
    function checkIfFullyUnsuspended(state) {
      if (0 === state.count && (0 === state.imgCount || !state.waitingForImages)) {
        if (state.stylesheets) insertSuspendedStylesheets(state, state.stylesheets);
        else if (state.unsuspend) {
          var unsuspend = state.unsuspend;
          state.unsuspend = null;
          unsuspend();
        }
      }
    }
    function onUnsuspend() {
      this.count--;
      checkIfFullyUnsuspended(this);
    }
    function onUnsuspendImg() {
      this.imgCount--;
      checkIfFullyUnsuspended(this);
    }
    var precedencesByRoot = null;
    function insertSuspendedStylesheets(state, resources) {
      state.stylesheets = null;
      null !== state.unsuspend && (state.count++, precedencesByRoot = /* @__PURE__ */ new Map(), resources.forEach(insertStylesheetIntoRoot, state), precedencesByRoot = null, onUnsuspend.call(state));
    }
    function insertStylesheetIntoRoot(root2, resource) {
      if (!(resource.state.loading & 4)) {
        var precedences = precedencesByRoot.get(root2);
        if (precedences) var last = precedences.get(null);
        else {
          precedences = /* @__PURE__ */ new Map();
          precedencesByRoot.set(root2, precedences);
          for (var nodes = root2.querySelectorAll(
            "link[data-precedence],style[data-precedence]"
          ), i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if ("LINK" === node.nodeName || "not all" !== node.getAttribute("media"))
              precedences.set(node.dataset.precedence, node), last = node;
          }
          last && precedences.set(null, last);
        }
        nodes = resource.instance;
        node = nodes.getAttribute("data-precedence");
        i = precedences.get(node) || last;
        i === last && precedences.set(null, nodes);
        precedences.set(node, nodes);
        this.count++;
        last = onUnsuspend.bind(this);
        nodes.addEventListener("load", last);
        nodes.addEventListener("error", last);
        i ? i.parentNode.insertBefore(nodes, i.nextSibling) : (root2 = 9 === root2.nodeType ? root2.head : root2, root2.insertBefore(nodes, root2.firstChild));
        resource.state.loading |= 4;
      }
    }
    var HostTransitionContext = {
      $$typeof: REACT_CONTEXT_TYPE,
      Provider: null,
      Consumer: null,
      _currentValue: sharedNotPendingObject,
      _currentValue2: sharedNotPendingObject,
      _threadCount: 0
    };
    function FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator, formState) {
      this.tag = 1;
      this.containerInfo = containerInfo;
      this.pingCache = this.current = this.pendingChildren = null;
      this.timeoutHandle = -1;
      this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null;
      this.callbackPriority = 0;
      this.expirationTimes = createLaneMap(-1);
      this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
      this.entanglements = createLaneMap(0);
      this.hiddenUpdates = createLaneMap(null);
      this.identifierPrefix = identifierPrefix;
      this.onUncaughtError = onUncaughtError;
      this.onCaughtError = onCaughtError;
      this.onRecoverableError = onRecoverableError;
      this.pooledCache = null;
      this.pooledCacheLanes = 0;
      this.formState = formState;
      this.transitionTypes = null;
      this.incompleteTransitions = /* @__PURE__ */ new Map();
    }
    function createFiberRoot(containerInfo, tag, hydrate, initialChildren, hydrationCallbacks, isStrictMode, identifierPrefix, formState, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator) {
      containerInfo = new FiberRootNode(
        containerInfo,
        tag,
        hydrate,
        identifierPrefix,
        onUncaughtError,
        onCaughtError,
        onRecoverableError,
        onDefaultTransitionIndicator,
        formState
      );
      tag = 1;
      true === isStrictMode && (tag |= 24);
      isStrictMode = createFiberImplClass(3, null, null, tag);
      containerInfo.current = isStrictMode;
      isStrictMode.stateNode = containerInfo;
      tag = createCache();
      tag.refCount++;
      containerInfo.pooledCache = tag;
      tag.refCount++;
      isStrictMode.memoizedState = {
        element: initialChildren,
        isDehydrated: hydrate,
        cache: tag
      };
      initializeUpdateQueue(isStrictMode);
      return containerInfo;
    }
    function getContextForSubtree(parentComponent) {
      if (!parentComponent) return emptyContextObject;
      parentComponent = emptyContextObject;
      return parentComponent;
    }
    function updateContainerImpl(rootFiber, lane, element, container, parentComponent, callback) {
      parentComponent = getContextForSubtree(parentComponent);
      null === container.context ? container.context = parentComponent : container.pendingContext = parentComponent;
      container = createUpdate(lane);
      container.payload = { element };
      callback = void 0 === callback ? null : callback;
      null !== callback && (container.callback = callback);
      element = enqueueUpdate(rootFiber, container, lane);
      null !== element && (scheduleUpdateOnFiber(element, rootFiber, lane), entangleTransitions(element, rootFiber, lane));
    }
    function markRetryLaneImpl(fiber, retryLane) {
      fiber = fiber.memoizedState;
      if (null !== fiber && null !== fiber.dehydrated) {
        var a = fiber.retryLane;
        fiber.retryLane = 0 !== a && a < retryLane ? a : retryLane;
      }
    }
    function markRetryLaneIfNotHydrated(fiber, retryLane) {
      markRetryLaneImpl(fiber, retryLane);
      (fiber = fiber.alternate) && markRetryLaneImpl(fiber, retryLane);
    }
    function attemptContinuousHydration(fiber) {
      if (13 === fiber.tag || 31 === fiber.tag) {
        var root2 = enqueueConcurrentRenderForLane(fiber, 67108864);
        null !== root2 && scheduleUpdateOnFiber(root2, fiber, 67108864);
        markRetryLaneIfNotHydrated(fiber, 67108864);
      }
    }
    function attemptHydrationAtCurrentPriority(fiber) {
      if (13 === fiber.tag || 31 === fiber.tag) {
        var lane = requestUpdateLane();
        lane = getBumpedLaneForHydrationByLane(lane);
        var root2 = enqueueConcurrentRenderForLane(fiber, lane);
        null !== root2 && scheduleUpdateOnFiber(root2, fiber, lane);
        markRetryLaneIfNotHydrated(fiber, lane);
      }
    }
    var _enabled = true;
    function dispatchDiscreteEvent(domEventName, eventSystemFlags, container, nativeEvent) {
      var prevTransition = ReactSharedInternals.T;
      ReactSharedInternals.T = null;
      var previousPriority = ReactDOMSharedInternals.p;
      try {
        ReactDOMSharedInternals.p = 2, dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
      } finally {
        ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition;
      }
    }
    function dispatchContinuousEvent(domEventName, eventSystemFlags, container, nativeEvent) {
      var prevTransition = ReactSharedInternals.T;
      ReactSharedInternals.T = null;
      var previousPriority = ReactDOMSharedInternals.p;
      try {
        ReactDOMSharedInternals.p = 8, dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
      } finally {
        ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition;
      }
    }
    function dispatchEvent(domEventName, eventSystemFlags, targetContainer, nativeEvent) {
      if (_enabled) {
        var blockedOn = findInstanceBlockingEvent(nativeEvent);
        if (null === blockedOn)
          dispatchEventForPluginEventSystem(
            domEventName,
            eventSystemFlags,
            nativeEvent,
            return_targetInst,
            targetContainer
          ), clearIfContinuousEvent(domEventName, nativeEvent);
        else if (queueIfContinuousEvent(
          blockedOn,
          domEventName,
          eventSystemFlags,
          targetContainer,
          nativeEvent
        ))
          nativeEvent.stopPropagation();
        else if (clearIfContinuousEvent(domEventName, nativeEvent), eventSystemFlags & 4 && -1 < discreteReplayableEvents.indexOf(domEventName)) {
          for (; null !== blockedOn; ) {
            var fiber = getInstanceFromNode(blockedOn);
            if (null !== fiber)
              switch (fiber.tag) {
                case 3:
                  fiber = fiber.stateNode;
                  if (fiber.current.memoizedState.isDehydrated) {
                    var lanes = getHighestPriorityLanes(fiber.pendingLanes);
                    if (0 !== lanes) {
                      var root2 = fiber;
                      root2.pendingLanes |= 2;
                      for (root2.entangledLanes |= 2; lanes; ) {
                        var lane = 1 << 31 - clz32(lanes);
                        root2.entanglements[1] |= lane;
                        lanes &= ~lane;
                      }
                      ensureRootIsScheduled(fiber);
                      0 === (executionContext & 6) && (workInProgressRootRenderTargetTime = now3() + 500, flushSyncWorkAcrossRoots_impl(0, false));
                    }
                  }
                  break;
                case 31:
                case 13:
                  root2 = enqueueConcurrentRenderForLane(fiber, 2), null !== root2 && scheduleUpdateOnFiber(root2, fiber, 2), flushSyncWork$1(), markRetryLaneIfNotHydrated(fiber, 2);
              }
            fiber = findInstanceBlockingEvent(nativeEvent);
            null === fiber && dispatchEventForPluginEventSystem(
              domEventName,
              eventSystemFlags,
              nativeEvent,
              return_targetInst,
              targetContainer
            );
            if (fiber === blockedOn) break;
            blockedOn = fiber;
          }
          null !== blockedOn && nativeEvent.stopPropagation();
        } else
          dispatchEventForPluginEventSystem(
            domEventName,
            eventSystemFlags,
            nativeEvent,
            null,
            targetContainer
          );
      }
    }
    function findInstanceBlockingEvent(nativeEvent) {
      nativeEvent = getEventTarget(nativeEvent);
      return findInstanceBlockingTarget(nativeEvent);
    }
    var return_targetInst = null;
    function findInstanceBlockingTarget(targetNode) {
      return_targetInst = null;
      targetNode = getClosestInstanceFromNode(targetNode);
      if (null !== targetNode) {
        var nearestMounted = getNearestMountedFiber(targetNode);
        if (null === nearestMounted) targetNode = null;
        else {
          var tag = nearestMounted.tag;
          if (13 === tag) {
            targetNode = getSuspenseInstanceFromFiber(nearestMounted);
            if (null !== targetNode) return targetNode;
            targetNode = null;
          } else if (31 === tag) {
            targetNode = getActivityInstanceFromFiber(nearestMounted);
            if (null !== targetNode) return targetNode;
            targetNode = null;
          } else if (3 === tag) {
            if (nearestMounted.stateNode.current.memoizedState.isDehydrated)
              return 3 === nearestMounted.tag ? nearestMounted.stateNode.containerInfo : null;
            targetNode = null;
          } else nearestMounted !== targetNode && (targetNode = null);
        }
      }
      return_targetInst = targetNode;
      return null;
    }
    function getEventPriority(domEventName) {
      switch (domEventName) {
        case "beforetoggle":
        case "cancel":
        case "click":
        case "close":
        case "contextmenu":
        case "copy":
        case "cut":
        case "auxclick":
        case "dblclick":
        case "dragend":
        case "dragstart":
        case "drop":
        case "focusin":
        case "focusout":
        case "input":
        case "invalid":
        case "keydown":
        case "keypress":
        case "keyup":
        case "mousedown":
        case "mouseup":
        case "paste":
        case "pause":
        case "play":
        case "pointercancel":
        case "pointerdown":
        case "pointerup":
        case "ratechange":
        case "reset":
        case "seeked":
        case "submit":
        case "toggle":
        case "touchcancel":
        case "touchend":
        case "touchstart":
        case "volumechange":
        case "change":
        case "selectionchange":
        case "textInput":
        case "compositionstart":
        case "compositionend":
        case "compositionupdate":
        case "beforeblur":
        case "afterblur":
        case "beforeinput":
        case "blur":
        case "fullscreenchange":
        case "fullscreenerror":
        case "focus":
        case "hashchange":
        case "popstate":
        case "select":
        case "selectstart":
          return 2;
        case "drag":
        case "dragenter":
        case "dragexit":
        case "dragleave":
        case "dragover":
        case "mousemove":
        case "mouseout":
        case "mouseover":
        case "pointermove":
        case "pointerout":
        case "pointerover":
        case "resize":
        case "scroll":
        case "touchmove":
        case "wheel":
        case "mouseenter":
        case "mouseleave":
        case "pointerenter":
        case "pointerleave":
          return 8;
        case "message":
          switch (getCurrentPriorityLevel()) {
            case ImmediatePriority:
              return 2;
            case UserBlockingPriority:
              return 8;
            case NormalPriority$1:
            case LowPriority:
              return 32;
            case IdlePriority:
              return 268435456;
            default:
              return 32;
          }
        default:
          return 32;
      }
    }
    var hasScheduledReplayAttempt = false;
    var queuedFocus = null;
    var queuedDrag = null;
    var queuedMouse = null;
    var queuedPointers = /* @__PURE__ */ new Map();
    var queuedPointerCaptures = /* @__PURE__ */ new Map();
    var queuedExplicitHydrationTargets = [];
    var discreteReplayableEvents = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
      " "
    );
    function clearIfContinuousEvent(domEventName, nativeEvent) {
      switch (domEventName) {
        case "focusin":
        case "focusout":
          queuedFocus = null;
          break;
        case "dragenter":
        case "dragleave":
          queuedDrag = null;
          break;
        case "mouseover":
        case "mouseout":
          queuedMouse = null;
          break;
        case "pointerover":
        case "pointerout":
          queuedPointers.delete(nativeEvent.pointerId);
          break;
        case "gotpointercapture":
        case "lostpointercapture":
          queuedPointerCaptures.delete(nativeEvent.pointerId);
      }
    }
    function accumulateOrCreateContinuousQueuedReplayableEvent(existingQueuedEvent, blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) {
      if (null === existingQueuedEvent || existingQueuedEvent.nativeEvent !== nativeEvent)
        return existingQueuedEvent = {
          blockedOn,
          domEventName,
          eventSystemFlags,
          nativeEvent,
          targetContainers: [targetContainer]
        }, null !== blockedOn && (blockedOn = getInstanceFromNode(blockedOn), null !== blockedOn && attemptContinuousHydration(blockedOn)), existingQueuedEvent;
      existingQueuedEvent.eventSystemFlags |= eventSystemFlags;
      blockedOn = existingQueuedEvent.targetContainers;
      null !== targetContainer && -1 === blockedOn.indexOf(targetContainer) && blockedOn.push(targetContainer);
      return existingQueuedEvent;
    }
    function queueIfContinuousEvent(blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) {
      switch (domEventName) {
        case "focusin":
          return queuedFocus = accumulateOrCreateContinuousQueuedReplayableEvent(
            queuedFocus,
            blockedOn,
            domEventName,
            eventSystemFlags,
            targetContainer,
            nativeEvent
          ), true;
        case "dragenter":
          return queuedDrag = accumulateOrCreateContinuousQueuedReplayableEvent(
            queuedDrag,
            blockedOn,
            domEventName,
            eventSystemFlags,
            targetContainer,
            nativeEvent
          ), true;
        case "mouseover":
          return queuedMouse = accumulateOrCreateContinuousQueuedReplayableEvent(
            queuedMouse,
            blockedOn,
            domEventName,
            eventSystemFlags,
            targetContainer,
            nativeEvent
          ), true;
        case "pointerover":
          var pointerId = nativeEvent.pointerId;
          queuedPointers.set(
            pointerId,
            accumulateOrCreateContinuousQueuedReplayableEvent(
              queuedPointers.get(pointerId) || null,
              blockedOn,
              domEventName,
              eventSystemFlags,
              targetContainer,
              nativeEvent
            )
          );
          return true;
        case "gotpointercapture":
          return pointerId = nativeEvent.pointerId, queuedPointerCaptures.set(
            pointerId,
            accumulateOrCreateContinuousQueuedReplayableEvent(
              queuedPointerCaptures.get(pointerId) || null,
              blockedOn,
              domEventName,
              eventSystemFlags,
              targetContainer,
              nativeEvent
            )
          ), true;
      }
      return false;
    }
    function attemptExplicitHydrationTarget(queuedTarget) {
      var targetInst = getClosestInstanceFromNode(queuedTarget.target);
      if (null !== targetInst) {
        var nearestMounted = getNearestMountedFiber(targetInst);
        if (null !== nearestMounted) {
          if (targetInst = nearestMounted.tag, 13 === targetInst) {
            if (targetInst = getSuspenseInstanceFromFiber(nearestMounted), null !== targetInst) {
              queuedTarget.blockedOn = targetInst;
              runWithPriority(queuedTarget.priority, function() {
                attemptHydrationAtCurrentPriority(nearestMounted);
              });
              return;
            }
          } else if (31 === targetInst) {
            if (targetInst = getActivityInstanceFromFiber(nearestMounted), null !== targetInst) {
              queuedTarget.blockedOn = targetInst;
              runWithPriority(queuedTarget.priority, function() {
                attemptHydrationAtCurrentPriority(nearestMounted);
              });
              return;
            }
          } else if (3 === targetInst && nearestMounted.stateNode.current.memoizedState.isDehydrated) {
            queuedTarget.blockedOn = 3 === nearestMounted.tag ? nearestMounted.stateNode.containerInfo : null;
            return;
          }
        }
      }
      queuedTarget.blockedOn = null;
    }
    function attemptReplayContinuousQueuedEvent(queuedEvent) {
      if (null !== queuedEvent.blockedOn) return false;
      for (var targetContainers = queuedEvent.targetContainers; 0 < targetContainers.length; ) {
        var nextBlockedOn = findInstanceBlockingEvent(queuedEvent.nativeEvent);
        if (null === nextBlockedOn) {
          nextBlockedOn = queuedEvent.nativeEvent;
          var nativeEventClone = new nextBlockedOn.constructor(
            nextBlockedOn.type,
            nextBlockedOn
          );
          currentReplayingEvent = nativeEventClone;
          nextBlockedOn.target.dispatchEvent(nativeEventClone);
          currentReplayingEvent = null;
        } else
          return targetContainers = getInstanceFromNode(nextBlockedOn), null !== targetContainers && attemptContinuousHydration(targetContainers), queuedEvent.blockedOn = nextBlockedOn, false;
        targetContainers.shift();
      }
      return true;
    }
    function attemptReplayContinuousQueuedEventInMap(queuedEvent, key2, map) {
      attemptReplayContinuousQueuedEvent(queuedEvent) && map.delete(key2);
    }
    function replayUnblockedEvents() {
      hasScheduledReplayAttempt = false;
      null !== queuedFocus && attemptReplayContinuousQueuedEvent(queuedFocus) && (queuedFocus = null);
      null !== queuedDrag && attemptReplayContinuousQueuedEvent(queuedDrag) && (queuedDrag = null);
      null !== queuedMouse && attemptReplayContinuousQueuedEvent(queuedMouse) && (queuedMouse = null);
      queuedPointers.forEach(attemptReplayContinuousQueuedEventInMap);
      queuedPointerCaptures.forEach(attemptReplayContinuousQueuedEventInMap);
    }
    function scheduleCallbackIfUnblocked(queuedEvent, unblocked) {
      queuedEvent.blockedOn === unblocked && (queuedEvent.blockedOn = null, hasScheduledReplayAttempt || (hasScheduledReplayAttempt = true, Scheduler.unstable_scheduleCallback(
        Scheduler.unstable_NormalPriority,
        replayUnblockedEvents
      )));
    }
    var lastScheduledReplayQueue = null;
    function scheduleReplayQueueIfNeeded(formReplayingQueue) {
      lastScheduledReplayQueue !== formReplayingQueue && (lastScheduledReplayQueue = formReplayingQueue, Scheduler.unstable_scheduleCallback(
        Scheduler.unstable_NormalPriority,
        function() {
          lastScheduledReplayQueue === formReplayingQueue && (lastScheduledReplayQueue = null);
          for (var i = 0; i < formReplayingQueue.length; i += 3) {
            var form = formReplayingQueue[i], submitterOrAction = formReplayingQueue[i + 1], formData = formReplayingQueue[i + 2];
            if ("function" !== typeof submitterOrAction)
              if (null === findInstanceBlockingTarget(submitterOrAction || form))
                continue;
              else break;
            var formInst = getInstanceFromNode(form);
            null !== formInst && (formReplayingQueue.splice(i, 3), i -= 3, startHostTransition(
              formInst,
              {
                pending: true,
                data: formData,
                method: form.method,
                action: submitterOrAction
              },
              submitterOrAction,
              formData
            ));
          }
        }
      ));
    }
    function retryIfBlockedOn(unblocked) {
      function unblock(queuedEvent) {
        return scheduleCallbackIfUnblocked(queuedEvent, unblocked);
      }
      null !== queuedFocus && scheduleCallbackIfUnblocked(queuedFocus, unblocked);
      null !== queuedDrag && scheduleCallbackIfUnblocked(queuedDrag, unblocked);
      null !== queuedMouse && scheduleCallbackIfUnblocked(queuedMouse, unblocked);
      queuedPointers.forEach(unblock);
      queuedPointerCaptures.forEach(unblock);
      for (var i = 0; i < queuedExplicitHydrationTargets.length; i++) {
        var queuedTarget = queuedExplicitHydrationTargets[i];
        queuedTarget.blockedOn === unblocked && (queuedTarget.blockedOn = null);
      }
      for (; 0 < queuedExplicitHydrationTargets.length && (i = queuedExplicitHydrationTargets[0], null === i.blockedOn); )
        attemptExplicitHydrationTarget(i), null === i.blockedOn && queuedExplicitHydrationTargets.shift();
      i = (unblocked.ownerDocument || unblocked).$$reactFormReplay;
      if (null != i)
        for (queuedTarget = 0; queuedTarget < i.length; queuedTarget += 3) {
          var form = i[queuedTarget], submitterOrAction = i[queuedTarget + 1], formProps = form[internalPropsKey] || null;
          if ("function" === typeof submitterOrAction)
            formProps || scheduleReplayQueueIfNeeded(i);
          else if (formProps) {
            var action = null;
            if (submitterOrAction && submitterOrAction.hasAttribute("formAction"))
              if (form = submitterOrAction, formProps = submitterOrAction[internalPropsKey] || null)
                action = formProps.formAction;
              else {
                if (null !== findInstanceBlockingTarget(form)) continue;
              }
            else action = formProps.action;
            "function" === typeof action ? i[queuedTarget + 1] = action : (i.splice(queuedTarget, 3), queuedTarget -= 3);
            scheduleReplayQueueIfNeeded(i);
          }
        }
    }
    function defaultOnDefaultTransitionIndicator() {
      function handleNavigate(event) {
        event.canIntercept && "react-transition" === event.info && event.intercept({
          handler: function() {
            return new Promise(function(resolve) {
              return pendingResolve = resolve;
            });
          },
          focusReset: "manual",
          scroll: "manual"
        });
      }
      function handleNavigateComplete() {
        null !== pendingResolve && (pendingResolve(), pendingResolve = null);
        isCancelled || setTimeout(startFakeNavigation, 20);
      }
      function startFakeNavigation() {
        if (!isCancelled && !navigation.transition) {
          var currentEntry = navigation.currentEntry;
          currentEntry && null != currentEntry.url && navigation.navigate(currentEntry.url, {
            state: currentEntry.getState(),
            info: "react-transition",
            history: "replace"
          });
        }
      }
      if ("object" === typeof navigation) {
        var isCancelled = false, pendingResolve = null;
        navigation.addEventListener("navigate", handleNavigate);
        navigation.addEventListener("navigatesuccess", handleNavigateComplete);
        navigation.addEventListener("navigateerror", handleNavigateComplete);
        setTimeout(startFakeNavigation, 100);
        return function() {
          isCancelled = true;
          navigation.removeEventListener("navigate", handleNavigate);
          navigation.removeEventListener("navigatesuccess", handleNavigateComplete);
          navigation.removeEventListener("navigateerror", handleNavigateComplete);
          null !== pendingResolve && (pendingResolve(), pendingResolve = null);
        };
      }
    }
    function ReactDOMRoot(internalRoot) {
      this._internalRoot = internalRoot;
    }
    ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render = function(children) {
      var root2 = this._internalRoot;
      if (null === root2) throw Error(formatProdErrorMessage(409));
      var current2 = root2.current, lane = requestUpdateLane();
      updateContainerImpl(current2, lane, children, root2, null, null);
    };
    ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount = function() {
      var root2 = this._internalRoot;
      if (null !== root2) {
        this._internalRoot = null;
        var container = root2.containerInfo;
        updateContainerImpl(root2.current, 2, null, root2, null, null);
        flushSyncWork$1();
        container[internalContainerInstanceKey] = null;
      }
    };
    function ReactDOMHydrationRoot(internalRoot) {
      this._internalRoot = internalRoot;
    }
    ReactDOMHydrationRoot.prototype.unstable_scheduleHydration = function(target) {
      if (target) {
        var updatePriority = resolveUpdatePriority();
        target = { blockedOn: null, target, priority: updatePriority };
        for (var i = 0; i < queuedExplicitHydrationTargets.length && 0 !== updatePriority && updatePriority < queuedExplicitHydrationTargets[i].priority; i++) ;
        queuedExplicitHydrationTargets.splice(i, 0, target);
        0 === i && attemptExplicitHydrationTarget(target);
      }
    };
    var isomorphicReactPackageVersion$jscomp$inline_2043 = React9.version;
    if ("19.3.1" !== isomorphicReactPackageVersion$jscomp$inline_2043)
      throw Error(
        formatProdErrorMessage(
          527,
          isomorphicReactPackageVersion$jscomp$inline_2043,
          "19.3.1"
        )
      );
    ReactDOMSharedInternals.findDOMNode = function(componentOrElement) {
      var fiber = componentOrElement._reactInternals;
      if (void 0 === fiber) {
        if ("function" === typeof componentOrElement.render)
          throw Error(formatProdErrorMessage(188));
        componentOrElement = Object.keys(componentOrElement).join(",");
        throw Error(formatProdErrorMessage(268, componentOrElement));
      }
      componentOrElement = findCurrentFiberUsingSlowPath(fiber);
      componentOrElement = null !== componentOrElement ? findCurrentHostFiberImpl(componentOrElement) : null;
      componentOrElement = null === componentOrElement ? null : componentOrElement.stateNode;
      return componentOrElement;
    };
    var internals$jscomp$inline_2586 = {
      bundleType: 0,
      version: "19.3.1",
      rendererPackageName: "react-dom",
      currentDispatcherRef: ReactSharedInternals,
      reconcilerVersion: "19.3.1"
    };
    if ("undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__) {
      hook$jscomp$inline_2587 = __REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook$jscomp$inline_2587.isDisabled && hook$jscomp$inline_2587.supportsFiber)
        try {
          rendererID = hook$jscomp$inline_2587.inject(
            internals$jscomp$inline_2586
          ), injectedHook = hook$jscomp$inline_2587;
        } catch (err) {
        }
    }
    var hook$jscomp$inline_2587;
    exports.createRoot = function(container, options2) {
      if (!isValidContainer(container)) throw Error(formatProdErrorMessage(299));
      var isStrictMode = false, identifierPrefix = "", onUncaughtError = defaultOnUncaughtError, onCaughtError = defaultOnCaughtError, onRecoverableError = defaultOnRecoverableError;
      null !== options2 && void 0 !== options2 && (true === options2.unstable_strictMode && (isStrictMode = true), void 0 !== options2.identifierPrefix && (identifierPrefix = options2.identifierPrefix), void 0 !== options2.onUncaughtError && (onUncaughtError = options2.onUncaughtError), void 0 !== options2.onCaughtError && (onCaughtError = options2.onCaughtError), void 0 !== options2.onRecoverableError && (onRecoverableError = options2.onRecoverableError));
      options2 = createFiberRoot(
        container,
        1,
        false,
        null,
        null,
        isStrictMode,
        identifierPrefix,
        null,
        onUncaughtError,
        onCaughtError,
        onRecoverableError,
        defaultOnDefaultTransitionIndicator
      );
      container[internalContainerInstanceKey] = options2.current;
      listenToAllSupportedEvents(container);
      return new ReactDOMRoot(options2);
    };
    exports.hydrateRoot = function(container, initialChildren, options2) {
      if (!isValidContainer(container)) throw Error(formatProdErrorMessage(299));
      var isStrictMode = false, identifierPrefix = "", onUncaughtError = defaultOnUncaughtError, onCaughtError = defaultOnCaughtError, onRecoverableError = defaultOnRecoverableError, formState = null;
      null !== options2 && void 0 !== options2 && (true === options2.unstable_strictMode && (isStrictMode = true), void 0 !== options2.identifierPrefix && (identifierPrefix = options2.identifierPrefix), void 0 !== options2.onUncaughtError && (onUncaughtError = options2.onUncaughtError), void 0 !== options2.onCaughtError && (onCaughtError = options2.onCaughtError), void 0 !== options2.onRecoverableError && (onRecoverableError = options2.onRecoverableError), void 0 !== options2.formState && (formState = options2.formState));
      initialChildren = createFiberRoot(
        container,
        1,
        true,
        initialChildren,
        null != options2 ? options2 : null,
        isStrictMode,
        identifierPrefix,
        formState,
        onUncaughtError,
        onCaughtError,
        onRecoverableError,
        defaultOnDefaultTransitionIndicator
      );
      initialChildren.context = getContextForSubtree(null);
      options2 = initialChildren.current;
      isStrictMode = requestUpdateLane();
      isStrictMode = getBumpedLaneForHydrationByLane(isStrictMode);
      identifierPrefix = createUpdate(isStrictMode);
      identifierPrefix.callback = null;
      enqueueUpdate(options2, identifierPrefix, isStrictMode);
      options2 = isStrictMode;
      initialChildren.current.lanes = options2;
      markRootUpdated$1(initialChildren, options2);
      ensureRootIsScheduled(initialChildren);
      container[internalContainerInstanceKey] = initialChildren.current;
      listenToAllSupportedEvents(container);
      return new ReactDOMHydrationRoot(initialChildren);
    };
    exports.version = "19.3.1";
  }
});

// ../parity/proj/node_modules/react-dom/client.js
var require_client = __commonJS({
  "../parity/proj/node_modules/react-dom/client.js"(exports, module) {
    "use strict";
    function checkDCE() {
      if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
        return;
      }
      if (false) {
        throw new Error("^_^");
      }
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
      } catch (err) {
        console.error(err);
      }
    }
    if (true) {
      checkDCE();
      module.exports = require_react_dom_client_production();
    } else {
      module.exports = null;
    }
  }
});

// ../parity/proj/node_modules/react/cjs/react-jsx-runtime.production.js
var require_react_jsx_runtime_production = __commonJS({
  "../parity/proj/node_modules/react/cjs/react-jsx-runtime.production.js"(exports) {
    "use strict";
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    function jsxProd(type, config2, maybeKey) {
      var key2 = null;
      void 0 !== maybeKey && (key2 = "" + maybeKey);
      void 0 !== config2.key && (key2 = "" + config2.key);
      if ("key" in config2) {
        maybeKey = {};
        for (var propName in config2)
          "key" !== propName && (maybeKey[propName] = config2[propName]);
      } else maybeKey = config2;
      config2 = maybeKey.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key: key2,
        ref: void 0 !== config2 ? config2 : null,
        props: maybeKey
      };
    }
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.jsx = jsxProd;
    exports.jsxs = jsxProd;
  }
});

// ../parity/proj/node_modules/react/jsx-runtime.js
var require_jsx_runtime = __commonJS({
  "../parity/proj/node_modules/react/jsx-runtime.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_react_jsx_runtime_production();
    } else {
      module.exports = null;
    }
  }
});

// tools/parity/snip/entry.tsx
var import_react13 = __toESM(require_react(), 1);
var import_client2 = __toESM(require_client(), 1);

// src/hooks/useLensState.ts
var import_react2 = __toESM(require_react(), 1);

// tools/parity/mock/event.ts
var subs = {};
function emitLocal(event, payload) {
  (subs[event] ?? /* @__PURE__ */ new Set()).forEach((cb) => cb({ payload, event, id: 0 }));
}
globalThis.__lensEmit = emitLocal;
async function listen(event, cb) {
  (subs[event] ??= /* @__PURE__ */ new Set()).add(cb);
  return () => subs[event].delete(cb);
}

// tools/parity/mock/core.ts
var params = new URLSearchParams(location.search);
var preset = params.get("preset") || "obsidian";
var W = globalThis;
var base = {
  theme: { preset: "obsidian", accentMode: "custom", customAccent: "#FAFAFA", glassOpacity: 0.96, blurPx: 20, borderRadius: 8, accentTintStrength: 0, customCss: "", fontFamily: "rounded-arial", uiScale: 100, surfaceHex: "" },
  dock: {
    groundedMarginBottom: 0,
    iconSize: 40,
    hoverScale: 1.24,
    hoverLift: 8,
    autoHide: "never",
    showTopBar: true,
    pinnedApps: [
      { id: "explorer", name: "File Explorer", path: "C:\\Windows\\explorer.exe", iconHint: "folder" },
      { id: "terminal", name: "Terminal", path: "wt.exe", iconHint: "terminal" },
      { id: "notepad", name: "Notepad", path: "notepad.exe", iconHint: "file-text" },
      { id: "tb-chrome", name: "Google Chrome", path: "C:\\x\\Google Chrome.lnk", iconHint: null },
      { id: "tb-code", name: "Visual Studio Code", path: "C:\\x\\Visual Studio Code.lnk", iconHint: null },
      { id: "tb-spotify", name: "Spotify", path: "C:\\x\\Spotify.lnk", iconHint: null }
    ],
    pinnedFolders: [
      { id: "downloads", name: "Downloads", path: "C:\\Users\\u\\Downloads", theme: "accent", viewMode: "grid" },
      { id: "desktop", name: "Desktop", path: "C:\\Users\\u\\Desktop", theme: "obsidian", viewMode: "grid" }
    ]
  },
  topBar: { enabled: true, autoHide: "overlap", revealDelayMs: 100, hideDelayMs: 350, height: 34, floating: false, showMediaControls: true },
  func: { hideNativeTaskbar: true, runOnStartup: true, paletteHotkey: "Alt+Space", widgetsHotkey: "Alt+W", gamingPause: true, middleClickNewInstance: true, injectedHook: false, trayHost: false, tilingHotkeys: false, clipboardHistory: false, targetMonitor: "primary" },
  windowControls: { enabled: true, style: "traffic-classic", order: "green-yellow-red", position: "top-right", frameBorderEnabled: true, frameStyle: "obsidian-hairline", excludedProcesses: [] },
  iconStyle: { theme: "obsidian-squircle", shape: "squircle" },
  folderStyle: { theme: "accent", globalExplorerOverride: false },
  sessions: [{ id: "main", name: "Main", color: "#2D7D9A", apps: [] }, { id: "focus", name: "Focus", color: "#22C55E", apps: [] }, { id: "creative", name: "Creative", color: "#EAB308", apps: [] }],
  activeSessionId: "main",
  widgets: { enabledWidgets: ["clock", "telemetry", "notes", "quick-actions"], notes: "Welcome" },
  styledFolders: [],
  onboardingCompleted: true,
  themeSchedule: null
};
var config = JSON.parse(JSON.stringify(base));
var now = Date.now();
var note = (id, title, body, appName, mins) => ({ id, title, body, appName, category: "system", tsMs: now - mins * 6e4, source: "lens" });
var notes = [
  note("n1", "Build finished", "Lens UI built in 2 min 14 s.", "Terminal", 2),
  note("n2", "Tests passed", "86 tests, 0 failures.", "Terminal", 5),
  note("n3", "Pushed", "feature/productivity-input", "Terminal", 9),
  note("n4", "Deploy queued", "Pages will update shortly.", "Terminal", 14),
  note("n5", "Theme switched", "Alabaster Daylight is on until sunset.", "Lens UI", 30)
];
config.theme.preset = preset;
W.__lensConfig = () => config;
W.__lensSetConfig = (c) => {
  config = c;
};
var win = (hwnd, title, proc, exe, focused = false) => ({ hwnd, title, processName: proc, exePath: exe, isFocused: focused, isMinimized: false, isMaximized: focused, iconDataUrl: null });
var running = [
  win(101, "Lens UI \u2014 Visual Studio Code", "Code.exe", "C:\\x\\Code.exe", true),
  win(102, "Google Chrome", "chrome.exe", "C:\\x\\chrome.exe"),
  win(103, "Spotify Premium", "Spotify.exe", "C:\\x\\Spotify.exe"),
  win(104, "Downloads - File Explorer", "explorer.exe", "C:\\Windows\\explorer.exe")
];
var apps = ["Blender 5.1", "Audacity", "Android Studio", "7-Zip File Manager", "Adobe Photoshop 2023", "Google Chrome", "Notepad", "Spotify", "Steam", "Visual Studio Code", "Discord", "OBS Studio"].map((n) => ({ name: n, path: `C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\${n}.lnk`, category: "App" }));
var wsGroups = params.get("ws") === "groups";
var wsDefs = [
  { index: 0, id: "ws-1", name: "Main", color: "#60A5FA", layout: "", windowCount: 2 },
  { index: 1, id: "ws-2", name: "Work", color: "#34D399", layout: "", windowCount: 1 },
  { index: 2, id: "ws-3", name: "Play", color: "#FBBF24", layout: "", windowCount: 1 }
];
var wsStatus = () => wsGroups ? { enabled: true, mode: "groups", active: 0, workspaces: wsDefs, desktopCount: 1, appRulesActive: false, note: "" } : { enabled: false, active: "1", workspaces: [] };
config.dndSchedule = { enabled: true, ranges: [{ startMin: 1320, endMin: 420, days: [0, 1, 2, 3, 4, 5, 6] }, { startMin: 540, endMin: 720, days: [1, 2, 3, 4, 5] }], autoFullscreen: true };
var handlers = {
  // Wave 4–6 cards (integration): enough realistic data for every Control Center tab.
  list_monitors_cmd: () => [
    { id: "\\\\.\\DISPLAY1", name: "DELL U2723QE", x: 0, y: 0, width: 2560, height: 1440, workX: 0, workY: 0, workWidth: 2560, workHeight: 1392, scale: 1.5, primary: true },
    { id: "\\\\.\\DISPLAY2", name: "LG 27GL850", x: 2560, y: 0, width: 2560, height: 1440, workX: 2560, workY: 0, workWidth: 2560, workHeight: 1440, scale: 1, primary: false }
  ],
  get_keyhook_status_cmd: () => ({ winLauncher: false, altTab: false, active: false, suspended: false, pausedForFullscreen: false, lastProblem: "" }),
  get_ui_scale_support_cmd: () => false,
  get_update_settings_cmd: () => ({ mode: "notify", lastCheckMs: Date.now() - 36e5 }),
  list_crash_reports_cmd: () => [],
  ai_status: () => ({
    providers: [
      { id: "script", kind: "script", label: "Offline helper", available: true, model: "", is_local: true, needs_key: false, has_key: false },
      { id: "local", kind: "local", label: "Ollama", available: true, model: "llama3.2:3b", is_local: true, needs_key: false, has_key: false },
      { id: "claude", kind: "claude", label: "Claude", available: true, model: "claude-sonnet-5-5", is_local: false, needs_key: true, has_key: false }
    ],
    active: "off",
    privacy: "local_only"
  }),
  ai_usage_log: () => [],
  clip_status: () => ({ enabled: false, pausedUntilMs: 0, ignoreNext: false, count: 0, pinned: 0, settings: { enabled: false, maxItems: 500, maxDays: 30, maxTotalBytes: 67108864, maxItemBytes: 2097152, excludedApps: ["1password.exe", "bitwarden.exe", "keepassxc.exe"], captureImages: true, captureFiles: true, preferPlainPaste: false } }),
  clip_list: () => [],
  selection_policy_get: () => ({ bubble: false, readOnRequest: true, mode: "allow", apps: ["winword.exe", "excel.exe", "notepad.exe", "code.exe"], maxChars: 2e4 }),
  command_templates: () => ({ templates: [], error: null, path: "C:\\Users\\u\\AppData\\Roaming\\LensUI\\commands.json" }),
  shelves_list: () => [{ id: "default", name: "Shelf", created_ms: Date.now(), item_count: 0, approx_tokens: 0 }],
  shelf_list: () => [],
  bridge_status: () => ({ enabled: false, running: false, port: 0, hosts: [{ browser: "chrome", installed: false }, { browser: "edge", installed: false }, { browser: "firefox", installed: false }], urlSchemeInstalled: false, explorerVerbsInstalled: false, chromiumExtensionId: "flioplocnjlfpjbgoekcbdmacpedkaej", firefoxExtensionId: "lens@lensui.app", extraExtensionIds: [], pending: 0, windowsOnly: false }),
  bridge_inbox: () => [],
  claude_code_command: () => 'claude mcp add lens -- "C:\\Program Files\\Lens UI\\lens-ui.exe" --mcp-stdio',
  transcribe_status: () => [],
  get_mcp_status_cmd: () => ({ running: false, port: 0, connections: 0, command: "C:\\Program Files\\Lens UI\\lens-ui.exe", args: ["--mcp-stdio"], claudeDesktopSnippet: "{}", endpointFile: "" }),
  list_mcp_actions_cmd: () => [],
  get_mcp_audit_cmd: () => [],
  list_top_processes_cmd: () => [
    { pid: 4120, name: "chrome.exe", cpuUsage: 6.4, memoryMb: 812 },
    { pid: 8812, name: "Code.exe", cpuUsage: 3.1, memoryMb: 640 },
    { pid: 2244, name: "lens-ui.exe", cpuUsage: 0.8, memoryMb: 210 }
  ],
  transcribe_settings_get: () => ({
    settings: { whisperBin: null, modelPath: null, ffmpegPath: null, ytdlpPath: null, urlTranscription: false, urlTermsAcknowledged: false, nextToSource: false, defaultLanguage: "auto", threads: null, liveCaptionsExperimental: false },
    tools: { whisperBin: null, modelPath: null, ffmpegPath: null, ytdlpPath: null, ready: false, canDoVideo: false, canDoUrls: false, notes: ["whisper.cpp not found. Point Lens at whisper-cli.exe."] },
    transcriptsDir: "C:\\Users\\u\\AppData\\Roaming\\LensUI\\transcripts"
  }),
  get_config: () => config,
  get_wallpaper_state_cmd: () => ({ settings: { enabled: false, file: "", fit: "cover", blur: 0, dim: 0, saturation: 100, pauseWhenCovered: true, pauseOnBattery: true, accentHex: "", followAccent: false }, path: null, kind: null, attached: false, folder: "C:\\Users\\u\\AppData\\Roaming\\LensUI\\wallpapers" }),
  list_wallpapers_cmd: () => [],
  get_battery_cmd: () => ({ present: true, percent: 76, charging: false, minutesRemaining: 214, powerMode: "balanced", batterySaver: false }),
  get_keyboard_layouts_cmd: () => ({ current: "00000409", layouts: [{ id: "00000409", short: "ENG", name: "English (United States)" }] }),
  list_plugins_cmd: () => [],
  list_plugin_approvals_cmd: () => [],
  get_tiling_status_cmd: () => ({ enabled: false, layout: "master-stack", tiled: 0, floating: 0 }),
  get_workspaces_status_cmd: wsStatus,
  get_window_workspaces_cmd: () => wsGroups ? [[101, 0], [102, 1], [103, 2], [104, 0]] : [],
  move_window_to_workspace_cmd: () => wsStatus(),
  get_alt_drag_status_cmd: () => ({ enabled: true, hookActive: true, reinstalls: 0, lastProblem: "" }),
  get_app_summon_status_cmd: () => {
    const b = config.appSummon?.bindings ?? [];
    return b.map((x, i) => ({ id: x.id, ok: i === 0, message: i === 0 ? "Ready" : "Lens already uses this shortcut." }));
  },
  get_dnd_status_cmd: () => ({ active: true, manual: false, scheduled: true, fullscreen: false, reason: "schedule", untilMin: 420 }),
  set_dnd_schedule_cmd: (a) => {
    config = { ...config, dndSchedule: a.schedule };
    return { active: false, manual: false, scheduled: false, fullscreen: false, reason: "", untilMin: null };
  },
  get_search_usage_cmd: () => ({ entries: {} }),
  search_files_cmd: () => [],
  list_user_scripts_cmd: () => [],
  get_mcp_status_cmd: () => ({ running: false, port: 0, connections: 0, command: "C:\\Program Files\\Lens UI\\lens-ui.exe", args: ["--mcp-stdio"], claudeDesktopSnippet: "{}", endpointFile: "" }),
  list_mcp_actions_cmd: () => [],
  get_mcp_audit_cmd: () => [],
  save_config_cmd: (a) => {
    config = a.newConfig;
    emitLocal("lens://config-updated", config);
    return null;
  },
  get_windows_theme: () => ({ accentHex: "#2D7D9A", accentR: 45, accentG: 125, accentB: 154, appsUseLightTheme: false, systemUsesLightTheme: false, transparencyEnabled: true }),
  get_running_windows: () => running,
  get_icon_for_path: () => null,
  get_media_now_playing_cmd: () => ({ hasSession: true, isPlaying: true, title: "Midnight City", artist: "M83", album: "", sourceApp: "Spotify", thumbnailDataUrl: null }),
  get_quick_state_cmd: () => ({ volume: 62, muted: false, brightness: 80, nightLightEnabled: false, nightLightWarmth: 40 }),
  list_audio_sessions_cmd: () => [{ pid: 1, name: "Spotify", volume: 70, muted: false }, { pid: 2, name: "Chrome", volume: 40, muted: false }],
  get_telemetry_cmd: () => ({ cpuUsage: 14, memUsedGb: 9.2, memTotalGb: 32, memPercent: 29, uptimeMinutes: 312, cpuUsagePercent: 14, memoryUsedGb: 9.2, memoryTotalGb: 32, uptimeSeconds: 18720 }),
  scan_installed_apps_cmd: () => apps,
  get_launcher_home_cmd: () => ({ recentFiles: [{ name: "Q4 report.docx", path: "C:\\Users\\u\\Documents\\Q4 report.docx", extension: "docx", modifiedMinutesAgo: 12 }, { name: "logo.png", path: "C:\\Users\\u\\Pictures\\logo.png", extension: "png", modifiedMinutesAgo: 40 }], folders: [{ name: "Downloads", path: "C:\\Users\\u\\Downloads", color: "cobalt", itemCount: 42 }, { name: "Documents", path: "C:\\Users\\u\\Documents", color: "amber", itemCount: 18 }] }),
  list_theme_files_cmd: () => [],
  list_tray_icons_cmd: () => [],
  get_topbar_visible_cmd: () => true,
  is_surface_visible_cmd: () => false,
  get_dnd_cmd: () => false,
  list_desktop_items_cmd: () => [],
  get_desktop_icons_hidden_cmd: () => true,
  get_window_rules_cmd: () => params.get("styling") ? [{ match: "windowsterminal", opacity: 90, inactiveOpacity: 70, frame: "default", corners: "default", exclude: false }] : [],
  // Window styling 2.0. `?styling=demo` shows the overlay border + dimming; `?styling=w10` a Windows 10 PC.
  get_window_styling_cmd: () => {
    const mode = params.get("styling");
    const caps = mode === "w10" ? { windowsBuild: 19045, nativeBorder: false, roundedCorners: false, overlays: true } : { windowsBuild: 26100, nativeBorder: true, roundedCorners: true, overlays: true };
    const settings2 = mode ? { dimInactive: 25, activeBorder: { mode: "overlay", style: "gradient", colors: ["#60A5FA", "#C084FC", "#F472B6"], widthPx: 3, glowPx: 12 }, skipFullscreen: true, exclusions: ["obs64", "steam"], peekDelayMs: 600 } : { dimInactive: 0, activeBorder: { mode: "off", style: "solid", colors: ["#60A5FA", "#C084FC"], widthPx: 2, glowPx: 0 }, skipFullscreen: true, exclusions: [], peekDelayMs: 600 };
    return { settings: settings2, caps };
  },
  set_window_styling_cmd: (a) => a.settings,
  list_pinned_windows_cmd: () => params.get("styling") ? [{ hwnd: 102, process: "chrome", title: "Google Chrome" }] : [],
  get_shell_mode_status_cmd: () => ({ enabled: false, shellValue: "", exePath: "", explorerRunningAsShell: true, lastBootOk: true }),
  get_notification_center_cmd: () => ({ dnd: false, dndStatus: { active: true, manual: false, scheduled: true, fullscreen: false, reason: "schedule", untilMin: 420 }, items: notes, windows: { status: "unavailable", reason: "Test harness", items: [] } }),
  clipboard_list_cmd: () => ({ entries: [], paused: false }),
  get_training_stats_cmd: () => ({ pairCount: 0, filePath: "", fileSizeBytes: 0, recentPairs: [], macros: [] }),
  get_windhawk_status_cmd: () => ({ installed: false, exePath: null, modSourcePath: "", modInstalledInWindhawk: false })
};
var calls = [];
W.__lensCalls = calls;
async function invoke(cmd, args) {
  calls.push(cmd);
  const h = handlers[cmd];
  return h ? h(args ?? {}) : null;
}

// tools/parity/snip/mockCore.ts
var now2 = Date.now();
var settings = {
  enabled: true,
  hotkey: "Ctrl+Shift+S",
  printScreen: true,
  defaultMode: "region",
  delaySeconds: 0,
  includeCursor: false,
  afterCapture: "studio",
  saveDir: "",
  filenameTemplate: "Lens Snip {date} at {time}",
  autoRedact: true,
  ocrLanguage: "auto",
  beautify: "none",
  pinOpacity: 1,
  pinClickThrough: false,
  recordFps: 30,
  recordFormat: "mp4",
  recordQuality: "balanced",
  recordMic: "",
  recordClickHighlight: true,
  historyEnabled: true,
  historyDays: 30,
  historyMax: 500,
  historyMaxMb: 1024,
  showRecent: true
};
var extra = {
  snip_status: () => ({ settings, ocrLanguages: ["en-US", "de-DE"], canRecord: true, hotkeyOk: true, printScreenOwned: true, message: "", recording: false }),
  snip_recent: () => [
    { id: "claude-desktop", kind: "claude", label: "Claude", exe: null, lastMs: now2, count: 9 },
    { id: "app:discord.exe", kind: "app", label: "Discord", exe: "C:\\Users\\u\\AppData\\Local\\Discord\\Discord.exe", lastMs: now2 - 6e4, count: 4 },
    { id: "share", kind: "share", label: "Share\u2026", exe: null, lastMs: now2 - 36e5, count: 2 },
    { id: "app:slack.exe", kind: "app", label: "Slack", exe: "C:\\Program Files\\Slack\\slack.exe", lastMs: now2 - 72e5, count: 1 }
  ],
  snip_running_apps: () => [
    { hwnd: 11, rect: { x: 0, y: 0, w: 800, h: 600 }, title: "#design-review \u2014 Lens", app: "Discord", exe: "C:\\x\\Discord.exe" },
    { hwnd: 12, rect: { x: 0, y: 0, w: 800, h: 600 }, title: "Inbox \u2014 Outlook", app: "Olk", exe: "C:\\x\\olk.exe" },
    { hwnd: 13, rect: { x: 0, y: 0, w: 800, h: 600 }, title: "Untitled \u2014 Notepad", app: "Notepad", exe: "C:\\x\\notepad.exe" }
  ],
  snip_elements: () => [],
  snip_take_pending: () => null,
  snip_session: () => null,
  snip_history: () => [],
  snip_record_mics: () => ["Microphone Array (Realtek(R) Audio)"],
  ai_status: () => ({
    providers: [
      { id: "local", kind: "local", label: "Ollama \xB7 llama3.2", available: true, model: "llama3.2:3b", is_local: true, needs_key: false, has_key: false },
      { id: "claude", kind: "claude", label: "Claude", available: true, model: "claude-sonnet-5-5", is_local: false, needs_key: true, has_key: true }
    ],
    active: new URLSearchParams(location.search).get("ai") === "claude" ? "claude" : "local",
    privacy: "ask_each_time"
  })
};
async function invoke2(cmd, args) {
  if (extra[cmd]) return await extra[cmd](args ?? {});
  return invoke(cmd, args);
}

// src/themes/packs.ts
var THEME_PACKS = [
  // ---- Core ----
  { id: "obsidian", label: "Obsidian", tier: "Core", accent: "#FAFAFA", accentMode: "custom", tint: 0, radius: 8, iconTheme: "obsidian-squircle", iconShape: "squircle", folderTheme: "obsidian", frameStyle: "obsidian-hairline", controlStyle: "traffic-classic", dockStyle: "floating", recommended: true, description: "Matte black glass with crisp white chrome. The Lens default.", aliases: ["obsidian"] },
  { id: "windows-mesh", label: "Windows Mesh", tier: "Core", base: "#0D1017", accent: "#2D7D9A", accentMode: "windows", tint: 0.16, radius: 8, iconTheme: "frosted-glass", iconShape: "squircle", folderTheme: "accent", frameStyle: "accent-glow", controlStyle: "traffic-muted", dockStyle: "taskbar", recommended: true, description: "Follows your Windows accent colour, with a familiar full-width taskbar.", aliases: ["mesh", "windows mesh"] },
  { id: "graphite", label: "Graphite", tier: "Core", base: "#18181C", accent: "#A1A1AA", accentMode: "custom", tint: 0, radius: 10, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "minimal", frameStyle: "none", controlStyle: "minimal-dots", dockStyle: "minimal", description: "Quiet grey, borderless windows and monochrome icons. Nothing shouts.", aliases: ["graphite", "stealth"] },
  { id: "midnight", label: "Midnight", tier: "Core", base: "#050507", accent: "#818CF8", accentMode: "custom", tint: 0, radius: 8, iconTheme: "accent-duotone", iconShape: "squircle", folderTheme: "cobalt", frameStyle: "accent-glow", controlStyle: "traffic-muted", dockStyle: "slim", description: "True-black surfaces with an indigo glow. Easy on OLED screens.", aliases: ["midnight"] },
  // ---- Linux Suite ----
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", tier: "Linux Suite", base: "#1E1E2E", accent: "#CBA6F7", accentMode: "custom", tint: 0, radius: 12, iconTheme: "frosted-glass", iconShape: "squircle", folderTheme: "violet", frameStyle: "accent-glow", controlStyle: "traffic-muted", dockStyle: "floating", recommended: true, description: "Soft pastel mauve on a cosy dark base. Rounded and friendly.", aliases: ["catppuccin", "mocha"] },
  { id: "tokyo-night", label: "Tokyo Night", tier: "Linux Suite", base: "#1A1B26", accent: "#7AA2F7", accentMode: "custom", tint: 0, radius: 10, iconTheme: "obsidian-squircle", iconShape: "squircle", folderTheme: "cobalt", frameStyle: "accent-glow", controlStyle: "traffic-classic", dockStyle: "split", recommended: true, description: "Deep navy with neon-city blue. Apps and folders sit in separate pills.", aliases: ["tokyo night", "tokyonight", "tokyo"] },
  { id: "nord-frost", label: "Nord Frost", tier: "Linux Suite", base: "#2E3440", accent: "#88C0D0", accentMode: "custom", tint: 0, radius: 8, iconTheme: "frosted-glass", iconShape: "squircle", folderTheme: "frost", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", dockStyle: "slim", description: "Arctic slate grey with icy cyan. Lighter than most dark themes.", aliases: ["nord"] },
  { id: "dracula-glass", label: "Dracula Glass", tier: "Linux Suite", base: "#282A36", accent: "#FF79C6", accentMode: "custom", tint: 0, radius: 10, iconTheme: "accent-duotone", iconShape: "squircle", folderTheme: "rose", frameStyle: "accent-glow", controlStyle: "accent-pills", dockStyle: "floating", description: "Dracula's grey-violet base with hot-pink highlights and pill buttons.", aliases: ["dracula"] },
  { id: "gruvbox-warm", label: "Gruvbox Warm", tier: "Linux Suite", base: "#282828", accent: "#FE8019", accentMode: "custom", tint: 0, radius: 6, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "ember", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", dockStyle: "taskbar", description: "Retro warm grey with orange. Squarer corners, taskbar layout.", aliases: ["gruvbox"] },
  { id: "kanagawa-wave", label: "Kanagawa Wave", tier: "Linux Suite", base: "#1F1F28", accent: "#E46876", accentMode: "custom", tint: 0, radius: 10, iconTheme: "obsidian-squircle", iconShape: "rounded", folderTheme: "ember", frameStyle: "obsidian-hairline", controlStyle: "minimal-dots", dockStyle: "minimal", description: "Ink-wash dark with a muted wave red. Calm, low-contrast chrome.", aliases: ["kanagawa"] },
  { id: "rose-pine", label: "Ros\xE9 Pine", tier: "Linux Suite", base: "#191724", accent: "#EBBCBA", accentMode: "custom", tint: 0, radius: 14, iconTheme: "frosted-glass", iconShape: "circle", folderTheme: "rose", frameStyle: "accent-glow", controlStyle: "traffic-muted", dockStyle: "floating", description: "Dusky purple with rose-gold accents and round icons.", aliases: ["rose pine", "ros\xE9 pine", "rosepine"] },
  { id: "everforest-dark", label: "Everforest", tier: "Linux Suite", base: "#2D353B", accent: "#A7C080", accentMode: "custom", tint: 0, radius: 8, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "emerald", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", dockStyle: "slim", description: "Forest green-grey with moss highlights. Relaxed and natural.", aliases: ["everforest"] },
  { id: "hyprland-neon", label: "Hyprland Neon", tier: "Linux Suite", base: "#0A0C12", accent: "#33CCFF", accentMode: "custom", tint: 0, radius: 14, iconTheme: "accent-duotone", iconShape: "squircle", folderTheme: "neon", frameStyle: "neon", controlStyle: "accent-pills", dockStyle: "split", description: "Tiling-desktop look: glowing cyan borders and split dock pills.", aliases: ["hyprland"] },
  // ---- Studio ----
  { id: "sequoia-frost", label: "Sequoia Frost", tier: "Studio", base: "#1E1E20", accent: "#0A84FF", accentMode: "custom", tint: 0, radius: 14, iconTheme: "native", iconShape: "squircle", folderTheme: "cobalt", frameStyle: "obsidian-hairline", controlStyle: "traffic-classic", dockStyle: "floating", recommended: true, description: "Polished studio dark with system blue, full-colour icons and big corners.", aliases: ["sequoia", "macos"] },
  { id: "cyberpunk-amber", label: "Cyberpunk Amber", tier: "Studio", base: "#0D0B09", accent: "#FCEE0A", accentMode: "custom", tint: 0, radius: 2, iconTheme: "obsidian-squircle", iconShape: "rounded", folderTheme: "amber", frameStyle: "neon", controlStyle: "accent-pills", dockStyle: "taskbar", description: "Hard edges, electric yellow glow and a sharp taskbar.", aliases: ["cyberpunk"] },
  { id: "solarized-matte", label: "Solarized Matte", tier: "Studio", base: "#002B36", accent: "#2AA198", accentMode: "custom", tint: 0, radius: 8, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "frost", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", dockStyle: "studio", description: "Classic teal-blue Solarized with a labelled studio dock.", aliases: ["solarized"] },
  // ---- Light ----
  { id: "alabaster-daylight", label: "Alabaster Daylight", tier: "Light", scheme: "light", base: "#EEEEF0", accent: "#2563EB", accentMode: "custom", tint: 0, radius: 10, iconTheme: "native", iconShape: "squircle", folderTheme: "cobalt", frameStyle: "obsidian-hairline", controlStyle: "traffic-classic", dockStyle: "floating", recommended: true, description: "Clean cool-grey daylight with white cards and a clear blue accent.", aliases: ["alabaster", "daylight", "light"] },
  { id: "paper-minimal", label: "Paper Minimal", tier: "Light", scheme: "light", base: "#F5F1E8", accent: "#C2410C", accentMode: "custom", tint: 0, radius: 6, iconTheme: "native", iconShape: "rounded", folderTheme: "ember", frameStyle: "none", controlStyle: "minimal-dots", dockStyle: "slim", description: "Warm paper white with terracotta ink. Borderless and bookish.", aliases: ["paper"] }
];
var FOLDER_THEMES = [
  { id: "accent", label: "Accent" },
  { id: "obsidian", label: "Matte" },
  { id: "minimal", label: "Minimal" },
  { id: "cobalt", label: "Cobalt" },
  { id: "emerald", label: "Emerald" },
  { id: "amber", label: "Amber" },
  { id: "rose", label: "Rose" },
  { id: "violet", label: "Violet" },
  { id: "frost", label: "Frost" },
  { id: "ember", label: "Ember" },
  { id: "neon", label: "Neon" }
];
var FRAME_STYLES = [
  { id: "obsidian-hairline", label: "Hairline" },
  { id: "accent-glow", label: "Accent" },
  { id: "neon", label: "Neon" },
  { id: "none", label: "Borderless" }
];
var ICON_THEMES = ["obsidian-squircle", "frosted-glass", "monochrome", "accent-duotone", "native"];
var ICON_SHAPES = ["squircle", "rounded", "circle", "borderless"];
var CONTROL_STYLES = ["traffic-classic", "traffic-muted", "minimal-dots", "accent-pills"];
var CUSTOM_PACK_PREFIX = "custom-";
var customPacks = /* @__PURE__ */ new Map();
function relLuminance(hex) {
  const c = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrastRatio(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function validateCustomPack(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw;
  const hexOk = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
  const pick = (v, allowed, fallback) => typeof v === "string" && allowed.includes(v) ? v : fallback;
  if (!hexOk(r.base) || !hexOk(r.accent)) return null;
  const rawId = typeof r.id === "string" ? r.id : typeof r.label === "string" ? r.label : "";
  const slug = rawId.toLowerCase().replace(new RegExp("^" + CUSTOM_PACK_PREFIX), "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  if (!slug) return null;
  const base2 = r.base.toUpperCase();
  const accent = r.accent.toUpperCase();
  const light = r.scheme === "light" ? true : r.scheme === "dark" ? false : relLuminance(base2) > 0.4;
  if (contrastRatio(base2, light ? "#18181B" : "#FAFAFA") < 4.5) return null;
  const label = typeof r.label === "string" && /^[\w .'&-]{1,40}$/.test(r.label.trim()) ? r.label.trim() : slug;
  const radius = typeof r.radius === "number" && Number.isFinite(r.radius) ? Math.round(Math.min(20, Math.max(0, r.radius))) : 8;
  const pack = {
    id: CUSTOM_PACK_PREFIX + slug,
    label,
    tier: "Custom",
    base: base2,
    accent,
    accentMode: "custom",
    tint: 0,
    radius,
    iconTheme: pick(r.iconTheme, ICON_THEMES, light ? "native" : "obsidian-squircle"),
    iconShape: pick(r.iconShape, ICON_SHAPES, "squircle"),
    folderTheme: pick(r.folderTheme, FOLDER_THEMES.map((f) => f.id), "accent"),
    frameStyle: pick(r.frameStyle, FRAME_STYLES.map((f) => f.id), "obsidian-hairline"),
    controlStyle: pick(r.controlStyle, CONTROL_STYLES, "traffic-classic"),
    aliases: []
  };
  if (light) pack.scheme = "light";
  return pack;
}
function registerCustomPack(raw) {
  const pack = validateCustomPack(raw);
  if (pack) customPacks.set(pack.id, pack);
  return pack;
}
function packById(id) {
  if (!id) return void 0;
  return THEME_PACKS.find((p2) => p2.id === id) ?? customPacks.get(id);
}
function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function lighten(hex, amount) {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const ch = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return "#" + ch.map((v) => clamp255(v + (255 - v) * amount).toString(16).padStart(2, "0")).join("");
}

// src/themes/customPacks.ts
var inFlight = null;
function loadCustomPacksFromDisk() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let count = 0;
    try {
      const files = await invoke2("list_theme_files_cmd");
      for (const file of files) {
        try {
          const raw = JSON.parse(await invoke2("read_theme_file_cmd", { name: file.name }));
          if (raw && typeof raw === "object" && raw.lenstheme === 1 && raw.pack !== void 0) {
            if (registerCustomPack(raw.pack)) count += 1;
          }
        } catch {
        }
      }
    } catch {
    }
    return count;
  })();
  const done = inFlight;
  done.finally(() => {
    if (inFlight === done) inFlight = null;
  });
  return done;
}
async function ensurePackLoaded(presetId) {
  if (!presetId) return false;
  if (packById(presetId)) return true;
  await loadCustomPacksFromDisk();
  return !!packById(presetId);
}

// src/i18n/index.ts
var import_react = __toESM(require_react(), 1);

// src/i18n/locales/en.ts
var dict = {
  "topbar.desktops": "Desktops",
  "topbar.esc": "ESC",
  "topbar.open_launcher": "Open Launcher",
  "topbar.show_all_windows": "Show all windows",
  "topbar.previous_desktop": "Previous Desktop",
  "topbar.desktops_overview": "Desktops Overview",
  "topbar.next_desktop": "Next Desktop",
  "topbar.new_desktop": "New Desktop",
  "topbar.previous_track": "Previous Track",
  "topbar.next_track": "Next Track",
  "topbar.search_apps_files_folders": "Search apps, files, folders",
  "topbar.show_system_tray_for_a_few_seconds": "Show system tray for a few seconds",
  "topbar.notifications": "Notifications",
  "topbar.wi_fi_and_network": "Wi-Fi and Network",
  "topbar.volume_and_audio_mixer": "Volume and Audio Mixer",
  "topbar.quick_settings": "Quick Settings",
  "topbar.open_calendar_and_clock": "Open Calendar and Clock",
  "topbar.pause": "Pause",
  "topbar.play": "Play",
  "dock.min": "Min",
  "dock.max": "Max",
  "dock.top": "Top",
  "dock.new_window": "New Window",
  "dock.run_as_admin": "Run as Admin",
  "dock.open": "Open",
  "dock.file_location": "File Location",
  "dock.unpin": "Unpin",
  "dock.pin_to_dock": "Pin to Dock",
  "dock.open_folder": "Open Folder",
  "dock.remove": "Remove",
  "dock.quick_controls": "Quick Controls",
  "dock.search": "Search",
  "dock.all_files": "All Files \u2192",
  "dock.quick_folders": "Quick Folders",
  "dock.folders": "Folders \u2192",
  "dock.installed_apps": "Installed Apps",
  "dock.no_matching_apps_files_or_folders": "No matching apps, files, or folders.",
  "dock.esc": "ESC",
  "dock.previous": "Previous",
  "dock.next": "Next",
  "dock.close_window": "Close window",
  "dock.lens_grounded_dock": "Lens Grounded Dock",
  "dock.toggle_lens_search": "Toggle Lens Search",
  "dock.search_2": "Search\u2026",
  "dock.folder": "Folder",
  "dock.app": "App",
  "dock.run": "Run \u21B5",
  "dock.overview": "Overview",
  "dock.files": "Files",
  "dock.folders_2": "Folders",
  "dock.apps": "Apps",
  "dock.running": "Running",
  "dock.active": "Active",
  "dock.show_taskbar": "Show Taskbar",
  "dock.hide_taskbar": "Hide Taskbar",
  "dock.pause": "Pause",
  "dock.play": "Play",
  "dock.in_top_bar": "In Top Bar",
  "dock.pin_top_bar": "Pin Top Bar",
  "dock.theme_and_look": "Theme & Look",
  "dock.dock_and_top_bar": "Dock & Top Bar",
  "dock.recent_files_and_active_windows": "Recent Files & Active Windows",
  "dock.system_stats_and_task_manager": "System Stats & Task Manager",
  "dock.settings_and_control_center": "Settings & Control Center",
  "dock.close": "Close",
  "dock.lens_search_alt_space": "Lens Search (Alt+Space)",
  "qs.quick": "Quick",
  "qs.theme": "Theme",
  "qs.all": "All",
  "qs.wi_fi": "Wi-Fi",
  "qs.bluetooth": "Bluetooth",
  "qs.hotspot": "Hotspot",
  "qs.vpn": "VPN",
  "qs.ethernet": "Ethernet",
  "qs.proxy": "Proxy",
  "qs.wi_fi_networks": "Wi-Fi Networks",
  "qs.network_status": "Network Status",
  "qs.output_devices": "Output Devices",
  "qs.open_full_windows_settings": "Open Full Windows Settings",
  "qs.visual_master_theme": "Visual Master Theme",
  "qs.windows_accent_color": "Windows Accent Color",
  "qs.surface_and_glass_tuning": "Surface & Glass Tuning",
  "qs.desktop_and_shell_controls": "Desktop & Shell Controls",
  "qs.traffic_light_controls": "Traffic Light Controls",
  "qs.green_yellow_red_across_all_windows": "Green \xB7 Yellow \xB7 Red across all windows",
  "qs.green_yellow_red": "Green \xB7 Yellow \xB7 Red",
  "qs.red_yellow_green": "Red \xB7 Yellow \xB7 Green",
  "qs.top_bar_auto_hide": "Top Bar Auto-Hide",
  "qs.hide_smoothly_when_windows_overlap": "Hide smoothly when windows overlap",
  "qs.floating_top_bar": "Floating Top Bar",
  "qs.detached_pill_style_with_margin": "Detached pill style with margin",
  "qs.hide_native_taskbar": "Hide Native Taskbar",
  "qs.auto_restores_safely_on_exit": "Auto-restores safely on exit",
  "qs.run_on_startup": "Run on Startup",
  "qs.launch_lens_ui_automatically_with_window": "Launch Lens UI automatically with Windows",
  "qs.folder_icon_theme": "Folder Icon Theme",
  "qs.open_full_lens_control_center": "Open Full Lens Control Center",
  "qs.live_system_telemetry": "Live System Telemetry",
  "qs.cpu": "CPU",
  "qs.ram": "RAM",
  "qs.uptime": "Uptime",
  "qs.windows_settings": "Windows Settings",
  "qs.open_full_widget_drawer": "Open Full Widget Drawer",
  "qs.alt_w": "Alt+W",
  "qs.toggle_night_light": "Toggle Night Light",
  "qs.mute_master_audio": "Mute Master Audio",
  "qs.matte": "Matte",
  "qs.accent": "Accent",
  "qs.cobalt": "Cobalt",
  "qs.emerald": "Emerald",
  "qs.display": "Display",
  "qs.sound": "Sound",
  "qs.power": "Power",
  "qs.apps": "Apps",
  "qs.storage": "Storage",
  "qs.updates": "Updates",
  "qs.network": "Network",
  "qs.personalize": "Personalize",
  "qs.gaming": "Gaming",
  "qs.system": "System",
  "qs.security": "Security",
  "qs.master_muted": "Master (Muted)",
  "qs.master_volume": "Master Volume",
  "qs.night_warmth": "Night Warmth",
  "qs.night_light_off": "Night Light (Off)",
  "qs.input_and_mic": "Input & Mic",
  "qs.display_and_eye_care": "Display & Eye Care",
  "qs.sound_and_mixer": "Sound & Mixer"
};
var en_default = dict;

// src/i18n/locales/es.ts
var dict2 = {
  "topbar.desktops": "Escritorios",
  "topbar.esc": "ESC",
  "topbar.open_launcher": "Abrir lanzador",
  "topbar.show_all_windows": "Mostrar todas las ventanas",
  "topbar.previous_desktop": "Escritorio anterior",
  "topbar.desktops_overview": "Vista de escritorios",
  "topbar.next_desktop": "Escritorio siguiente",
  "topbar.new_desktop": "Nuevo escritorio",
  "topbar.previous_track": "Pista anterior",
  "topbar.next_track": "Pista siguiente",
  "topbar.search_apps_files_folders": "Buscar apps, archivos y carpetas",
  "topbar.show_system_tray_for_a_few_seconds": "Mostrar la bandeja del sistema unos segundos",
  "topbar.notifications": "Notificaciones",
  "topbar.wi_fi_and_network": "Wi-Fi y red",
  "topbar.volume_and_audio_mixer": "Volumen y mezclador de audio",
  "topbar.quick_settings": "Configuraci\xF3n r\xE1pida",
  "topbar.open_calendar_and_clock": "Abrir calendario y reloj",
  "topbar.pause": "Pausar",
  "topbar.play": "Reproducir",
  "dock.min": "Minimizar",
  "dock.max": "Maximizar",
  "dock.top": "Arriba",
  "dock.new_window": "Nueva ventana",
  "dock.run_as_admin": "Ejecutar como administrador",
  "dock.open": "Abrir",
  "dock.file_location": "Ubicaci\xF3n del archivo",
  "dock.unpin": "Desanclar",
  "dock.pin_to_dock": "Fijar en el Dock",
  "dock.open_folder": "Abrir carpeta",
  "dock.remove": "Quitar",
  "dock.quick_controls": "Controles r\xE1pidos",
  "dock.search": "Buscar",
  "dock.all_files": "Todos los archivos \u2192",
  "dock.quick_folders": "Carpetas r\xE1pidas",
  "dock.folders": "Carpetas \u2192",
  "dock.installed_apps": "Apps instaladas",
  "dock.no_matching_apps_files_or_folders": "No hay apps, archivos ni carpetas que coincidan.",
  "dock.esc": "ESC",
  "dock.previous": "Anterior",
  "dock.next": "Siguiente",
  "dock.close_window": "Cerrar ventana",
  "dock.lens_grounded_dock": "Dock de Lens",
  "dock.toggle_lens_search": "Abrir o cerrar la b\xFAsqueda de Lens",
  "dock.search_2": "Buscar\u2026",
  "dock.folder": "Carpeta",
  "dock.app": "App",
  "dock.run": "Ejecutar \u21B5",
  "dock.overview": "Resumen",
  "dock.files": "Archivos",
  "dock.folders_2": "Carpetas",
  "dock.apps": "Apps",
  "dock.running": "En ejecuci\xF3n",
  "dock.active": "Activa",
  "dock.show_taskbar": "Mostrar barra de tareas",
  "dock.hide_taskbar": "Ocultar barra de tareas",
  "dock.pause": "Pausar",
  "dock.play": "Reproducir",
  "dock.in_top_bar": "En la barra superior",
  "dock.pin_top_bar": "Fijar en la barra superior",
  "dock.theme_and_look": "Tema y aspecto",
  "dock.dock_and_top_bar": "Dock y barra superior",
  "dock.recent_files_and_active_windows": "Archivos recientes y ventanas activas",
  "dock.system_stats_and_task_manager": "Estad\xEDsticas y Administrador de tareas",
  "dock.settings_and_control_center": "Configuraci\xF3n y Centro de control",
  "dock.close": "Cerrar",
  "dock.lens_search_alt_space": "B\xFAsqueda de Lens (Alt+Espacio)",
  "qs.quick": "R\xE1pido",
  "qs.theme": "Tema",
  "qs.all": "Todo",
  "qs.wi_fi": "Wi-Fi",
  "qs.bluetooth": "Bluetooth",
  "qs.hotspot": "Zona con cobertura",
  "qs.vpn": "VPN",
  "qs.ethernet": "Ethernet",
  "qs.proxy": "Proxy",
  "qs.wi_fi_networks": "Redes Wi-Fi",
  "qs.network_status": "Estado de la red",
  "qs.output_devices": "Dispositivos de salida",
  "qs.open_full_windows_settings": "Abrir la Configuraci\xF3n de Windows",
  "qs.visual_master_theme": "Tema visual principal",
  "qs.windows_accent_color": "Color de \xE9nfasis de Windows",
  "qs.surface_and_glass_tuning": "Ajuste de superficie y cristal",
  "qs.desktop_and_shell_controls": "Controles de escritorio y shell",
  "qs.traffic_light_controls": "Botones sem\xE1foro",
  "qs.green_yellow_red_across_all_windows": "Verde \xB7 Amarillo \xB7 Rojo en todas las ventanas",
  "qs.green_yellow_red": "Verde \xB7 Amarillo \xB7 Rojo",
  "qs.red_yellow_green": "Rojo \xB7 Amarillo \xB7 Verde",
  "qs.top_bar_auto_hide": "Ocultar barra superior autom\xE1ticamente",
  "qs.hide_smoothly_when_windows_overlap": "Se oculta suavemente cuando una ventana la cubre",
  "qs.floating_top_bar": "Barra superior flotante",
  "qs.detached_pill_style_with_margin": "Estilo de p\xEDldora separada con margen",
  "qs.hide_native_taskbar": "Ocultar barra de tareas nativa",
  "qs.auto_restores_safely_on_exit": "Se restaura de forma segura al salir",
  "qs.run_on_startup": "Iniciar con Windows",
  "qs.launch_lens_ui_automatically_with_window": "Iniciar Lens UI autom\xE1ticamente con Windows",
  "qs.folder_icon_theme": "Tema de iconos de carpeta",
  "qs.open_full_lens_control_center": "Abrir el Centro de control de Lens",
  "qs.live_system_telemetry": "Telemetr\xEDa del sistema en vivo",
  "qs.cpu": "CPU",
  "qs.ram": "RAM",
  "qs.uptime": "Tiempo activo",
  "qs.windows_settings": "Configuraci\xF3n de Windows",
  "qs.open_full_widget_drawer": "Abrir el panel de widgets",
  "qs.alt_w": "Alt+W",
  "qs.toggle_night_light": "Activar o desactivar luz nocturna",
  "qs.mute_master_audio": "Silenciar audio general",
  "qs.matte": "Mate",
  "qs.accent": "Acento",
  "qs.cobalt": "Cobalto",
  "qs.emerald": "Esmeralda",
  "qs.display": "Pantalla",
  "qs.sound": "Sonido",
  "qs.power": "Energ\xEDa",
  "qs.apps": "Apps",
  "qs.storage": "Almacenamiento",
  "qs.updates": "Actualizaciones",
  "qs.network": "Red",
  "qs.personalize": "Personalizar",
  "qs.gaming": "Juegos",
  "qs.system": "Sistema",
  "qs.security": "Seguridad",
  "qs.master_muted": "General (silenciado)",
  "qs.master_volume": "Volumen general",
  "qs.night_warmth": "Calidez nocturna",
  "qs.night_light_off": "Luz nocturna (desactivada)",
  "qs.input_and_mic": "Entrada y micr\xF3fono",
  "qs.display_and_eye_care": "Pantalla y cuidado visual",
  "qs.sound_and_mixer": "Sonido y mezclador"
};
var es_default = dict2;

// src/i18n/locales/de.ts
var dict3 = {
  "topbar.desktops": "Desktops",
  "topbar.esc": "ESC",
  "topbar.open_launcher": "Starter \xF6ffnen",
  "topbar.show_all_windows": "Alle Fenster anzeigen",
  "topbar.previous_desktop": "Vorheriger Desktop",
  "topbar.desktops_overview": "Desktop\xFCbersicht",
  "topbar.next_desktop": "N\xE4chster Desktop",
  "topbar.new_desktop": "Neuer Desktop",
  "topbar.previous_track": "Vorheriger Titel",
  "topbar.next_track": "N\xE4chster Titel",
  "topbar.search_apps_files_folders": "Apps, Dateien und Ordner suchen",
  "topbar.show_system_tray_for_a_few_seconds": "Infobereich kurz anzeigen",
  "topbar.notifications": "Benachrichtigungen",
  "topbar.wi_fi_and_network": "WLAN und Netzwerk",
  "topbar.volume_and_audio_mixer": "Lautst\xE4rke und Audiomixer",
  "topbar.quick_settings": "Schnelleinstellungen",
  "topbar.open_calendar_and_clock": "Kalender und Uhr \xF6ffnen",
  "topbar.pause": "Pause",
  "topbar.play": "Wiedergabe",
  "dock.min": "Minimieren",
  "dock.max": "Maximieren",
  "dock.top": "Oben",
  "dock.new_window": "Neues Fenster",
  "dock.run_as_admin": "Als Administrator ausf\xFChren",
  "dock.open": "\xD6ffnen",
  "dock.file_location": "Dateispeicherort",
  "dock.unpin": "L\xF6sen",
  "dock.pin_to_dock": "An Dock anheften",
  "dock.open_folder": "Ordner \xF6ffnen",
  "dock.remove": "Entfernen",
  "dock.quick_controls": "Schnellsteuerung",
  "dock.search": "Suchen",
  "dock.all_files": "Alle Dateien \u2192",
  "dock.quick_folders": "Schnellordner",
  "dock.folders": "Ordner \u2192",
  "dock.installed_apps": "Installierte Apps",
  "dock.no_matching_apps_files_or_folders": "Keine passenden Apps, Dateien oder Ordner.",
  "dock.esc": "ESC",
  "dock.previous": "Zur\xFCck",
  "dock.next": "Weiter",
  "dock.close_window": "Fenster schlie\xDFen",
  "dock.lens_grounded_dock": "Lens-Dock",
  "dock.toggle_lens_search": "Lens-Suche ein-/ausblenden",
  "dock.search_2": "Suchen\u2026",
  "dock.folder": "Ordner",
  "dock.app": "App",
  "dock.run": "Ausf\xFChren \u21B5",
  "dock.overview": "\xDCbersicht",
  "dock.files": "Dateien",
  "dock.folders_2": "Ordner",
  "dock.apps": "Apps",
  "dock.running": "Ge\xF6ffnet",
  "dock.active": "Aktiv",
  "dock.show_taskbar": "Taskleiste anzeigen",
  "dock.hide_taskbar": "Taskleiste ausblenden",
  "dock.pause": "Pause",
  "dock.play": "Wiedergabe",
  "dock.in_top_bar": "In der oberen Leiste",
  "dock.pin_top_bar": "An obere Leiste anheften",
  "dock.theme_and_look": "Design und Aussehen",
  "dock.dock_and_top_bar": "Dock und obere Leiste",
  "dock.recent_files_and_active_windows": "Zuletzt verwendete Dateien und aktive Fenster",
  "dock.system_stats_and_task_manager": "Systemwerte und Task-Manager",
  "dock.settings_and_control_center": "Einstellungen und Kontrollzentrum",
  "dock.close": "Schlie\xDFen",
  "dock.lens_search_alt_space": "Lens-Suche (Alt+Leertaste)",
  "qs.quick": "Schnell",
  "qs.theme": "Design",
  "qs.all": "Alle",
  "qs.wi_fi": "WLAN",
  "qs.bluetooth": "Bluetooth",
  "qs.hotspot": "Hotspot",
  "qs.vpn": "VPN",
  "qs.ethernet": "Ethernet",
  "qs.proxy": "Proxy",
  "qs.wi_fi_networks": "WLAN-Netzwerke",
  "qs.network_status": "Netzwerkstatus",
  "qs.output_devices": "Ausgabeger\xE4te",
  "qs.open_full_windows_settings": "Windows-Einstellungen \xF6ffnen",
  "qs.visual_master_theme": "Haupt-Design",
  "qs.windows_accent_color": "Windows-Akzentfarbe",
  "qs.surface_and_glass_tuning": "Oberfl\xE4che und Glas anpassen",
  "qs.desktop_and_shell_controls": "Desktop- und Shell-Steuerung",
  "qs.traffic_light_controls": "Ampel-Fensterkn\xF6pfe",
  "qs.green_yellow_red_across_all_windows": "Gr\xFCn \xB7 Gelb \xB7 Rot in allen Fenstern",
  "qs.green_yellow_red": "Gr\xFCn \xB7 Gelb \xB7 Rot",
  "qs.red_yellow_green": "Rot \xB7 Gelb \xB7 Gr\xFCn",
  "qs.top_bar_auto_hide": "Obere Leiste automatisch ausblenden",
  "qs.hide_smoothly_when_windows_overlap": "Weich ausblenden, wenn Fenster sie \xFCberdecken",
  "qs.floating_top_bar": "Schwebende obere Leiste",
  "qs.detached_pill_style_with_margin": "Abgesetzter Pillen-Stil mit Abstand",
  "qs.hide_native_taskbar": "Windows-Taskleiste ausblenden",
  "qs.auto_restores_safely_on_exit": "Wird beim Beenden sicher wiederhergestellt",
  "qs.run_on_startup": "Beim Start ausf\xFChren",
  "qs.launch_lens_ui_automatically_with_window": "Lens UI automatisch mit Windows starten",
  "qs.folder_icon_theme": "Ordnersymbol-Design",
  "qs.open_full_lens_control_center": "Lens-Kontrollzentrum \xF6ffnen",
  "qs.live_system_telemetry": "Live-Systemdaten",
  "qs.cpu": "CPU",
  "qs.ram": "RAM",
  "qs.uptime": "Betriebszeit",
  "qs.windows_settings": "Windows-Einstellungen",
  "qs.open_full_widget_drawer": "Widget-Leiste \xF6ffnen",
  "qs.alt_w": "Alt+W",
  "qs.toggle_night_light": "Nachtmodus umschalten",
  "qs.mute_master_audio": "Gesamtton stummschalten",
  "qs.matte": "Matt",
  "qs.accent": "Akzent",
  "qs.cobalt": "Kobalt",
  "qs.emerald": "Smaragd",
  "qs.display": "Anzeige",
  "qs.sound": "Sound",
  "qs.power": "Energie",
  "qs.apps": "Apps",
  "qs.storage": "Speicher",
  "qs.updates": "Updates",
  "qs.network": "Netzwerk",
  "qs.personalize": "Personalisieren",
  "qs.gaming": "Gaming",
  "qs.system": "System",
  "qs.security": "Sicherheit",
  "qs.master_muted": "Gesamt (stumm)",
  "qs.master_volume": "Gesamtlautst\xE4rke",
  "qs.night_warmth": "Nachtw\xE4rme",
  "qs.night_light_off": "Nachtmodus (aus)",
  "qs.input_and_mic": "Eingabe und Mikrofon",
  "qs.display_and_eye_care": "Anzeige und Augenschonung",
  "qs.sound_and_mixer": "Sound und Mixer"
};
var de_default = dict3;

// src/i18n/index.ts
var DICTS = { en: en_default, es: es_default, de: de_default };
var current = "en";
var listeners = /* @__PURE__ */ new Set();
function resolveLocale(setting, systemLanguage) {
  const pick = (raw) => {
    if (!raw) return null;
    const base2 = raw.trim().toLowerCase().split(/[-_]/)[0];
    return base2 in DICTS ? base2 : null;
  };
  if (setting && setting !== "auto") {
    const chosen = pick(setting);
    if (chosen) return chosen;
  }
  const sys = systemLanguage ?? (typeof navigator !== "undefined" ? navigator.language : void 0);
  return pick(sys) ?? "en";
}
function setLocale(setting) {
  const next = resolveLocale(setting);
  if (next !== current) {
    current = next;
    if (typeof document !== "undefined") document.documentElement.lang = next;
    listeners.forEach((fn) => fn(next));
  }
  return current;
}

// ../parity/proj/node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}

// ../parity/proj/node_modules/@tauri-apps/api/core.js
var _Channel_instances;
var _Channel_onmessage;
var _Channel_nextMessageIndex;
var _Channel_pendingMessages;
var _Channel_messageEndIndex;
var _Channel_deliver;
var _Resource_rid;
var SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
function transformCallback(callback, once2 = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once2);
}
var Channel = class {
  constructor(onmessage) {
    _Channel_instances.add(this);
    _Channel_onmessage.set(this, void 0);
    _Channel_nextMessageIndex.set(this, 0);
    _Channel_pendingMessages.set(this, []);
    _Channel_messageEndIndex.set(this, void 0);
    __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
    }), "f");
    this.id = transformCallback((rawMessage) => {
      const index = rawMessage.index;
      if ("end" in rawMessage) {
        if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
          this.cleanupCallback();
        } else {
          __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
        }
        return;
      }
      const message = rawMessage.message;
      if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
        __classPrivateFieldGet(this, _Channel_instances, "m", _Channel_deliver).call(this, message);
        __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
        while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
          const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
          __classPrivateFieldGet(this, _Channel_instances, "m", _Channel_deliver).call(this, message2);
          delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
          __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
        }
        if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
          this.cleanupCallback();
        }
      } else {
        __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
      }
    });
  }
  cleanupCallback() {
    window.__TAURI_INTERNALS__.unregisterCallback(this.id);
  }
  /**
   * The handler called for every message sent by the Rust side of this channel.
   *
   * Assigning a new handler replaces the previous one; messages that arrived
   * before a handler was set are not replayed, so set it (or pass it to the
   * constructor) before sending the channel to the backend.
   */
  set onmessage(handler) {
    __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
  }
  get onmessage() {
    return __classPrivateFieldGet(this, _Channel_onmessage, "f");
  }
  [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), _Channel_instances = /* @__PURE__ */ new WeakSet(), _Channel_deliver = function _Channel_deliver2(message) {
    try {
      __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
    } catch (error) {
      queueMicrotask(() => {
        throw error;
      });
    }
  }, SERIALIZE_TO_IPC_FN)]() {
    return `__CHANNEL__:${this.id}`;
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
async function invoke3(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
var Resource = class {
  get rid() {
    return __classPrivateFieldGet(this, _Resource_rid, "f");
  }
  constructor(rid) {
    _Resource_rid.set(this, void 0);
    __classPrivateFieldSet(this, _Resource_rid, rid, "f");
  }
  /**
   * Destroys and cleans up this resource from memory.
   * **You should not call any method on this object anymore and should drop any reference to it.**
   *
   * @remarks Uses the `core:resources:allow-close` permission, which is part of
   * the `core:resources:default` permission set enabled by default.
   */
  async close() {
    return invoke3("plugin:resources|close", {
      rid: this.rid
    });
  }
  async [(_Resource_rid = /* @__PURE__ */ new WeakMap(), Symbol.asyncDispose)]() {
    await this.close();
  }
};

// ../parity/proj/node_modules/@tauri-apps/api/dpi.js
var LogicalSize = class {
  constructor(...args) {
    this.type = "Logical";
    if (args.length === 1) {
      if ("Logical" in args[0]) {
        this.width = args[0].Logical.width;
        this.height = args[0].Logical.height;
      } else {
        this.width = args[0].width;
        this.height = args[0].height;
      }
    } else {
      this.width = args[0];
      this.height = args[1];
    }
  }
  /**
   * Converts the logical size to a physical one.
   * @example
   * ```typescript
   * import { LogicalSize } from '@tauri-apps/api/dpi';
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   *
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const size = new LogicalSize(400, 500);
   * const physical = size.toPhysical(factor);
   * ```
   *
   * @since 2.0.0
   */
  toPhysical(scaleFactor) {
    return new PhysicalSize(this.width * scaleFactor, this.height * scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      width: this.width,
      height: this.height
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
var PhysicalSize = class {
  constructor(...args) {
    this.type = "Physical";
    if (args.length === 1) {
      if ("Physical" in args[0]) {
        this.width = args[0].Physical.width;
        this.height = args[0].Physical.height;
      } else {
        this.width = args[0].width;
        this.height = args[0].height;
      }
    } else {
      this.width = args[0];
      this.height = args[1];
    }
  }
  /**
   * Converts the physical size to a logical one.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const size = await appWindow.innerSize(); // PhysicalSize
   * const logical = size.toLogical(factor);
   * ```
   *
   * @since 2.0.0
   */
  toLogical(scaleFactor) {
    return new LogicalSize(this.width / scaleFactor, this.height / scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      width: this.width,
      height: this.height
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
var Size = class {
  constructor(size) {
    this.size = size;
  }
  /**
   * Converts the wrapped size to a logical one.
   *
   * Returns the inner value untouched when it already is a {@linkcode LogicalSize}.
   *
   * @param scaleFactor The monitor scale factor, e.g. `await appWindow.scaleFactor()`.
   *
   * @since 2.1.0
   */
  toLogical(scaleFactor) {
    return this.size instanceof LogicalSize ? this.size : this.size.toLogical(scaleFactor);
  }
  /**
   * Converts the wrapped size to a physical one.
   *
   * Returns the inner value untouched when it already is a {@linkcode PhysicalSize}.
   *
   * @param scaleFactor The monitor scale factor, e.g. `await appWindow.scaleFactor()`.
   *
   * @since 2.1.0
   */
  toPhysical(scaleFactor) {
    return this.size instanceof PhysicalSize ? this.size : this.size.toPhysical(scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      [`${this.size.type}`]: {
        width: this.size.width,
        height: this.size.height
      }
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
var LogicalPosition = class {
  constructor(...args) {
    this.type = "Logical";
    if (args.length === 1) {
      if ("Logical" in args[0]) {
        this.x = args[0].Logical.x;
        this.y = args[0].Logical.y;
      } else {
        this.x = args[0].x;
        this.y = args[0].y;
      }
    } else {
      this.x = args[0];
      this.y = args[1];
    }
  }
  /**
   * Converts the logical position to a physical one.
   * @example
   * ```typescript
   * import { LogicalPosition } from '@tauri-apps/api/dpi';
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   *
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const position = new LogicalPosition(400, 500);
   * const physical = position.toPhysical(factor);
   * ```
   *
   * @since 2.0.0
   */
  toPhysical(scaleFactor) {
    return new PhysicalPosition(this.x * scaleFactor, this.y * scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      x: this.x,
      y: this.y
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
var PhysicalPosition = class {
  constructor(...args) {
    this.type = "Physical";
    if (args.length === 1) {
      if ("Physical" in args[0]) {
        this.x = args[0].Physical.x;
        this.y = args[0].Physical.y;
      } else {
        this.x = args[0].x;
        this.y = args[0].y;
      }
    } else {
      this.x = args[0];
      this.y = args[1];
    }
  }
  /**
   * Converts the physical position to a logical one.
   * @example
   * ```typescript
   * import { PhysicalPosition } from '@tauri-apps/api/dpi';
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   *
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const position = new PhysicalPosition(400, 500);
   * const logical = position.toLogical(factor);
   * ```
   *
   * @since 2.0.0
   */
  toLogical(scaleFactor) {
    return new LogicalPosition(this.x / scaleFactor, this.y / scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      x: this.x,
      y: this.y
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
var Position = class {
  constructor(position) {
    this.position = position;
  }
  /**
   * Converts the wrapped position to a logical one.
   *
   * Returns the inner value untouched when it already is a {@linkcode LogicalPosition}.
   *
   * @param scaleFactor The monitor scale factor, e.g. `await appWindow.scaleFactor()`.
   *
   * @since 2.1.0
   */
  toLogical(scaleFactor) {
    return this.position instanceof LogicalPosition ? this.position : this.position.toLogical(scaleFactor);
  }
  /**
   * Converts the wrapped position to a physical one.
   *
   * Returns the inner value untouched when it already is a {@linkcode PhysicalPosition}.
   *
   * @param scaleFactor The monitor scale factor, e.g. `await appWindow.scaleFactor()`.
   *
   * @since 2.1.0
   */
  toPhysical(scaleFactor) {
    return this.position instanceof PhysicalPosition ? this.position : this.position.toPhysical(scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      [`${this.position.type}`]: {
        x: this.position.x,
        y: this.position.y
      }
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};

// ../parity/proj/node_modules/@tauri-apps/api/event.js
var TauriEvent;
(function(TauriEvent2) {
  TauriEvent2["WINDOW_RESIZED"] = "tauri://resize";
  TauriEvent2["WINDOW_MOVED"] = "tauri://move";
  TauriEvent2["WINDOW_CLOSE_REQUESTED"] = "tauri://close-requested";
  TauriEvent2["WINDOW_DESTROYED"] = "tauri://destroyed";
  TauriEvent2["WINDOW_FOCUS"] = "tauri://focus";
  TauriEvent2["WINDOW_BLUR"] = "tauri://blur";
  TauriEvent2["WINDOW_SCALE_FACTOR_CHANGED"] = "tauri://scale-change";
  TauriEvent2["WINDOW_THEME_CHANGED"] = "tauri://theme-changed";
  TauriEvent2["WINDOW_CREATED"] = "tauri://window-created";
  TauriEvent2["WINDOW_SUSPENDED"] = "tauri://suspended";
  TauriEvent2["WINDOW_RESUMED"] = "tauri://resumed";
  TauriEvent2["WEBVIEW_CREATED"] = "tauri://webview-created";
  TauriEvent2["DRAG_ENTER"] = "tauri://drag-enter";
  TauriEvent2["DRAG_OVER"] = "tauri://drag-over";
  TauriEvent2["DRAG_DROP"] = "tauri://drag-drop";
  TauriEvent2["DRAG_LEAVE"] = "tauri://drag-leave";
})(TauriEvent || (TauriEvent = {}));
async function _unlisten(event, eventId) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event, eventId);
  await invoke3("plugin:event|unlisten", {
    event,
    eventId
  });
}
async function listen2(event, handler, options) {
  var _a;
  const target = typeof (options === null || options === void 0 ? void 0 : options.target) === "string" ? { kind: "AnyLabel", label: options.target } : (_a = options === null || options === void 0 ? void 0 : options.target) !== null && _a !== void 0 ? _a : { kind: "Any" };
  return invoke3("plugin:event|listen", {
    event,
    target,
    handler: transformCallback(handler)
  }).then((eventId) => {
    return async () => _unlisten(event, eventId);
  });
}
async function once(event, handler, options) {
  return listen2(event, (eventData) => {
    void _unlisten(event, eventData.id);
    handler(eventData);
  }, options);
}
async function emit(event, payload) {
  await invoke3("plugin:event|emit", {
    event,
    payload
  });
}
async function emitTo(target, event, payload) {
  const eventTarget = typeof target === "string" ? { kind: "AnyLabel", label: target } : target;
  await invoke3("plugin:event|emit_to", {
    target: eventTarget,
    event,
    payload
  });
}

// ../parity/proj/node_modules/@tauri-apps/api/image.js
var Image2 = class _Image extends Resource {
  /**
   * Creates an Image from a resource ID. For internal use only.
   *
   * @ignore
   */
  constructor(rid) {
    super(rid);
  }
  /**
   * Creates a new Image using RGBA data, in row-major order from top to bottom, and with specified width and height.
   *
   * The buffer must contain exactly `width * height * 4` bytes.
   * Unlike {@linkcode Image.fromBytes} and {@linkcode Image.fromPath} this does not
   * decode an image format, so it requires no extra Cargo feature.
   *
   * @example
   * ```typescript
   * import { Image } from '@tauri-apps/api/image';
   *
   * // a 1x1 opaque red image
   * const image = await Image.new(new Uint8Array([255, 0, 0, 255]), 1, 1);
   * ```
   *
   * @since 2.0.0
   */
  static async new(rgba, width, height) {
    return invoke3("plugin:image|new", {
      rgba,
      width,
      height
    }).then((rid) => new _Image(rid));
  }
  /**
   * Creates a new image using the provided bytes by inferring the file format.
   *
   * Only `ico` and `png` are supported (based on activated feature flag).
   *
   * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   *
   * @example
   * ```typescript
   * import { Image } from '@tauri-apps/api/image';
   *
   * const bytes = await fetch('/icon.png').then((r) => r.arrayBuffer());
   * const image = await Image.fromBytes(bytes);
   * ```
   *
   * @since 2.0.0
   */
  static async fromBytes(bytes) {
    return invoke3("plugin:image|from_bytes", {
      bytes
    }).then((rid) => new _Image(rid));
  }
  /**
   * Creates a new image using the provided path.
   *
   * Only `ico` and `png` are supported (based on activated feature flag).
   *
   * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   *
   * The path is resolved on the Rust side, so it must be a path on the user's
   * machine (for example one returned by the path APIs or a bundled resource
   * resolved with `resolveResource`), not a frontend asset URL.
   *
   * @example
   * ```typescript
   * import { Image } from '@tauri-apps/api/image';
   * import { resolveResource } from '@tauri-apps/api/path';
   *
   * const image = await Image.fromPath(await resolveResource('icons/icon.png'));
   * ```
   *
   * @since 2.0.0
   */
  static async fromPath(path) {
    return invoke3("plugin:image|from_path", { path }).then((rid) => new _Image(rid));
  }
  /**
   * Returns the RGBA data for this image, in row-major order from top to bottom.
   *
   * The returned buffer has `width * height * 4` bytes, see {@linkcode Image.size}.
   *
   * @example
   * ```typescript
   * import { Image } from '@tauri-apps/api/image';
   *
   * const image = await Image.fromPath('icons/icon.png');
   * const rgba = await image.rgba();
   * ```
   *
   * @since 2.0.0
   */
  async rgba() {
    return invoke3("plugin:image|rgba", {
      rid: this.rid
    }).then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Returns the size of this image, in pixels.
   *
   * @example
   * ```typescript
   * import { Image } from '@tauri-apps/api/image';
   *
   * const image = await Image.fromPath('icons/icon.png');
   * const { width, height } = await image.size();
   * ```
   *
   * @since 2.0.0
   */
  async size() {
    return invoke3("plugin:image|size", { rid: this.rid });
  }
};
function transformImage(image) {
  const ret = image == null ? null : typeof image === "string" ? image : image instanceof Image2 ? image.rid : image;
  return ret;
}

// ../parity/proj/node_modules/@tauri-apps/api/window.js
var UserAttentionType;
(function(UserAttentionType2) {
  UserAttentionType2[UserAttentionType2["Critical"] = 1] = "Critical";
  UserAttentionType2[UserAttentionType2["Informational"] = 2] = "Informational";
})(UserAttentionType || (UserAttentionType = {}));
var CloseRequestedEvent = class {
  constructor(event) {
    this._preventDefault = false;
    this.event = event.event;
    this.id = event.id;
  }
  /**
   * Prevents the window from being closed.
   *
   * Must be called before the handler returns (await anything you need first),
   * otherwise the window is destroyed as usual.
   */
  preventDefault() {
    this._preventDefault = true;
  }
  /** Whether {@link CloseRequestedEvent.preventDefault} was called on this event. */
  isPreventDefault() {
    return this._preventDefault;
  }
};
var ProgressBarStatus;
(function(ProgressBarStatus2) {
  ProgressBarStatus2["None"] = "none";
  ProgressBarStatus2["Normal"] = "normal";
  ProgressBarStatus2["Indeterminate"] = "indeterminate";
  ProgressBarStatus2["Paused"] = "paused";
  ProgressBarStatus2["Error"] = "error";
})(ProgressBarStatus || (ProgressBarStatus = {}));
function getCurrentWindow() {
  return new Window(window.__TAURI_INTERNALS__.metadata.currentWindow.label, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  });
}
async function getAllWindows() {
  return invoke3("plugin:window|get_all_windows").then((windows) => windows.map((w) => new Window(w, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  })));
}
var localTauriEvents = ["tauri://created", "tauri://error"];
var Window = class {
  /**
   * Creates a new Window.
   * @example
   * ```typescript
   * import { Window } from '@tauri-apps/api/window';
   * const appWindow = new Window('my-label');
   * appWindow.once('tauri://created', function () {
   *  // window successfully created
   * });
   * appWindow.once('tauri://error', function (e) {
   *  // an error happened creating the window
   * });
   * ```
   *
   * @param label The unique window label. Must be alphanumeric: `a-zA-Z-/:_`.
   * @param options The window configuration, see {@link WindowOptions}.
   * @returns The {@link Window} instance to communicate with the window.
   *
   * @remarks Requires the `core:window:allow-create` permission (not included in
   * `core:window:default`).
   */
  constructor(label, options = {}) {
    var _a;
    this.label = label;
    this.listeners = /* @__PURE__ */ Object.create(null);
    if (!(options === null || options === void 0 ? void 0 : options.skip)) {
      invoke3("plugin:window|create", {
        options: {
          ...options,
          parent: typeof options.parent === "string" ? options.parent : (_a = options.parent) === null || _a === void 0 ? void 0 : _a.label,
          label
        }
      }).then(async () => this.emit("tauri://created")).catch(async (e) => this.emit("tauri://error", e));
    }
  }
  /**
   * Gets the Window associated with the given label.
   * @example
   * ```typescript
   * import { Window } from '@tauri-apps/api/window';
   * const mainWindow = Window.getByLabel('main');
   * ```
   *
   * @param label The window label.
   * @returns The Window instance to communicate with the window or null if the window doesn't exist.
   */
  static async getByLabel(label) {
    var _a;
    return (_a = (await getAllWindows()).find((w) => w.label === label)) !== null && _a !== void 0 ? _a : null;
  }
  /**
   * Get an instance of `Window` for the current window.
   */
  static getCurrent() {
    return getCurrentWindow();
  }
  /**
   * Gets a list of instances of `Window` for all available windows.
   */
  static async getAll() {
    return getAllWindows();
  }
  /**
   *  Gets the focused window.
   * @example
   * ```typescript
   * import { Window } from '@tauri-apps/api/window';
   * const focusedWindow = Window.getFocusedWindow();
   * ```
   *
   * @returns The Window instance or `undefined` if there is not any focused window.
   */
  static async getFocusedWindow() {
    for (const w of await getAllWindows()) {
      if (await w.isFocused()) {
        return w;
      }
    }
    return null;
  }
  /**
   * Listen to an emitted event on this window.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const unlisten = await getCurrentWindow().listen<string>('state-changed', (event) => {
   *   console.log(`Got error: ${payload}`);
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param handler Event handler.
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listener is removed automatically when this window is destroyed,
   * so you do not need to unlisten just because the window is closing. Do call the
   * returned function when the listener's own scope ends, e.g. on page navigation
   * or when a component unmounts.
   */
  async listen(event, handler) {
    if (this._handleTauriEvent(event, handler)) {
      return () => {
        const listeners2 = this.listeners[event];
        listeners2.splice(listeners2.indexOf(handler), 1);
      };
    }
    return listen2(event, handler, {
      target: { kind: "Window", label: this.label }
    });
  }
  /**
   * Listen to an emitted event on this window only once.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const unlisten = await getCurrentWindow().once<null>('initialized', (event) => {
   *   console.log(`Window initialized!`);
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param handler Event handler.
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listener removes itself after the first event and is also removed
   * automatically when this window is destroyed. Do call the returned function if
   * the listener's own scope ends before the event arrives.
   */
  async once(event, handler) {
    if (this._handleTauriEvent(event, handler)) {
      return () => {
        const listeners2 = this.listeners[event];
        listeners2.splice(listeners2.indexOf(handler), 1);
      };
    }
    return once(event, handler, {
      target: { kind: "Window", label: this.label }
    });
  }
  /**
   * Emits an event to all {@link EventTarget|targets}.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().emit('window-loaded', { loggedIn: true, token: 'authToken' });
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param payload Event payload.
   */
  async emit(event, payload) {
    if (localTauriEvents.includes(event)) {
      for (const handler of this.listeners[event] || []) {
        handler({
          event,
          id: -1,
          payload
        });
      }
      return;
    }
    return emit(event, payload);
  }
  /**
   * Emits an event to all {@link EventTarget|targets} matching the given target.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().emitTo('main', 'window-loaded', { loggedIn: true, token: 'authToken' });
   * ```
   * @param target Label of the target Window/Webview/WebviewWindow or raw {@link EventTarget} object.
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param payload Event payload.
   */
  async emitTo(target, event, payload) {
    if (localTauriEvents.includes(event)) {
      for (const handler of this.listeners[event] || []) {
        handler({
          event,
          id: -1,
          payload
        });
      }
      return;
    }
    return emitTo(target, event, payload);
  }
  /** @ignore */
  _handleTauriEvent(event, handler) {
    if (localTauriEvents.includes(event)) {
      if (!(event in this.listeners)) {
        this.listeners[event] = [handler];
      } else {
        this.listeners[event].push(handler);
      }
      return true;
    }
    return false;
  }
  // Getters
  /**
   * The scale factor that can be used to map physical pixels to logical pixels.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const factor = await getCurrentWindow().scaleFactor();
   * ```
   *
   * @returns The window's monitor scale factor.
   */
  async scaleFactor() {
    return invoke3("plugin:window|scale_factor", {
      label: this.label
    });
  }
  /**
   * The position of the top-left hand corner of the window's client area relative to the top-left hand corner of the desktop.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const position = await getCurrentWindow().innerPosition();
   * ```
   *
   * @returns The window's inner position.
   */
  async innerPosition() {
    return invoke3("plugin:window|inner_position", {
      label: this.label
    }).then((p2) => new PhysicalPosition(p2));
  }
  /**
   * The position of the top-left hand corner of the window relative to the top-left hand corner of the desktop.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const position = await getCurrentWindow().outerPosition();
   * ```
   *
   * @returns The window's outer position.
   */
  async outerPosition() {
    return invoke3("plugin:window|outer_position", {
      label: this.label
    }).then((p2) => new PhysicalPosition(p2));
  }
  /**
   * The physical size of the window's client area.
   * The client area is the content of the window, excluding the title bar and borders.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const size = await getCurrentWindow().innerSize();
   * ```
   *
   * @returns The window's inner size.
   */
  async innerSize() {
    return invoke3("plugin:window|inner_size", {
      label: this.label
    }).then((s) => new PhysicalSize(s));
  }
  /**
   * The physical size of the entire window.
   * These dimensions include the title bar and borders. If you don't want that (and you usually don't), use inner_size instead.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const size = await getCurrentWindow().outerSize();
   * ```
   *
   * @returns The window's outer size.
   */
  async outerSize() {
    return invoke3("plugin:window|outer_size", {
      label: this.label
    }).then((s) => new PhysicalSize(s));
  }
  /**
   * Gets the window's current fullscreen state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const fullscreen = await getCurrentWindow().isFullscreen();
   * ```
   *
   * @returns Whether the window is in fullscreen mode or not.
   */
  async isFullscreen() {
    return invoke3("plugin:window|is_fullscreen", {
      label: this.label
    });
  }
  /**
   * Gets the window's current minimized state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const minimized = await getCurrentWindow().isMinimized();
   * ```
   */
  async isMinimized() {
    return invoke3("plugin:window|is_minimized", {
      label: this.label
    });
  }
  /**
   * Gets the window's current maximized state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const maximized = await getCurrentWindow().isMaximized();
   * ```
   *
   * @returns Whether the window is maximized or not.
   */
  async isMaximized() {
    return invoke3("plugin:window|is_maximized", {
      label: this.label
    });
  }
  /**
   * Gets the window's current focus state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const focused = await getCurrentWindow().isFocused();
   * ```
   *
   * @returns Whether the window is focused or not.
   */
  async isFocused() {
    return invoke3("plugin:window|is_focused", {
      label: this.label
    });
  }
  /**
   * Gets the window's current decorated state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const decorated = await getCurrentWindow().isDecorated();
   * ```
   *
   * @returns Whether the window is decorated or not.
   */
  async isDecorated() {
    return invoke3("plugin:window|is_decorated", {
      label: this.label
    });
  }
  /**
   * Gets the window's current resizable state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const resizable = await getCurrentWindow().isResizable();
   * ```
   *
   * @returns Whether the window is resizable or not.
   */
  async isResizable() {
    return invoke3("plugin:window|is_resizable", {
      label: this.label
    });
  }
  /**
   * Gets the window's native maximize button state.
   *
   * #### Platform-specific
   *
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const maximizable = await getCurrentWindow().isMaximizable();
   * ```
   *
   * @returns Whether the window's native maximize button is enabled or not.
   */
  async isMaximizable() {
    return invoke3("plugin:window|is_maximizable", {
      label: this.label
    });
  }
  /**
   * Gets the window's native minimize button state.
   *
   * #### Platform-specific
   *
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const minimizable = await getCurrentWindow().isMinimizable();
   * ```
   *
   * @returns Whether the window's native minimize button is enabled or not.
   */
  async isMinimizable() {
    return invoke3("plugin:window|is_minimizable", {
      label: this.label
    });
  }
  /**
   * Gets the window's native close button state.
   *
   * #### Platform-specific
   *
   * - **iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const closable = await getCurrentWindow().isClosable();
   * ```
   *
   * @returns Whether the window's native close button is enabled or not.
   */
  async isClosable() {
    return invoke3("plugin:window|is_closable", {
      label: this.label
    });
  }
  /**
   * Gets the window's current visible state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const visible = await getCurrentWindow().isVisible();
   * ```
   *
   * @returns Whether the window is visible or not.
   */
  async isVisible() {
    return invoke3("plugin:window|is_visible", {
      label: this.label
    });
  }
  /**
   * Gets the window's current title.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const title = await getCurrentWindow().title();
   * ```
   */
  async title() {
    return invoke3("plugin:window|title", {
      label: this.label
    });
  }
  /**
   * Gets the window's current theme.
   *
   * #### Platform-specific
   *
   * - **macOS:** Theme was introduced on macOS 10.14. Returns `light` on macOS 10.13 and below.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const theme = await getCurrentWindow().theme();
   * ```
   *
   * @returns The window theme.
   */
  async theme() {
    return invoke3("plugin:window|theme", {
      label: this.label
    });
  }
  /**
   * Whether the window is configured to be always on top of other windows or not.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const alwaysOnTop = await getCurrentWindow().isAlwaysOnTop();
   * ```
   *
   * @returns Whether the window is visible or not.
   */
  async isAlwaysOnTop() {
    return invoke3("plugin:window|is_always_on_top", {
      label: this.label
    });
  }
  /**
   * The name of the Android activity hosting this window.
   *
   * On Android each window is backed by its own activity. Use this to tell windows
   * apart from native code, or to match a window with the activity declared in your
   * `AndroidManifest.xml`.
   *
   * #### Platform-specific
   *
   * - **Android:** Supported.
   * - **Windows / Linux / macOS / iOS:** Unsupported, the call rejects because the
   *   command is not registered.
   *
   * See the [mobile multiwindow guide](https://tauri.app/learn/mobile-multiwindow/).
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const activity = await getCurrentWindow().activityName();
   * ```
   *
   * @returns The activity name.
   *
   * @remarks Uses the `core:window:allow-activity-name` permission, which is part
   * of `core:window:default`.
   *
   * @since 2.11.0
   */
  async activityName() {
    return invoke3("plugin:window|activity_name", {
      label: this.label
    });
  }
  /**
   * The identifier of the iOS scene hosting this window.
   *
   * On iOS each window is backed by a `UIScene`. Use this to tell windows apart
   * from native code, or to match a window with a scene configuration declared in
   * your `Info.plist`.
   *
   * #### Platform-specific
   *
   * - **iOS:** Supported.
   * - **Windows / Linux / macOS / Android:** Unsupported, the call rejects because
   *   the command is not registered.
   *
   * See the [mobile multiwindow guide](https://tauri.app/learn/mobile-multiwindow/).
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const scene = await getCurrentWindow().sceneIdentifier();
   * ```
   *
   * @returns The scene identifier.
   *
   * @remarks Uses the `core:window:allow-scene-identifier` permission, which is part
   * of `core:window:default`.
   *
   * @since 2.11.0
   */
  async sceneIdentifier() {
    return invoke3("plugin:window|scene_identifier", {
      label: this.label
    });
  }
  // Setters
  /**
   * Centers the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().center();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-center` permission (not included
   * in `core:window:default`).
   */
  async center() {
    return invoke3("plugin:window|center", {
      label: this.label
    });
  }
  /**
   *  Requests user attention to the window, this has no effect if the application
   * is already focused. How requesting for user attention manifests is platform dependent,
   * see `UserAttentionType` for details.
   *
   * Providing `null` will unset the request for user attention. Unsetting the request for
   * user attention might not be done automatically by the WM when the window receives input.
   *
   * #### Platform-specific
   *
   * - **macOS:** `null` has no effect.
   * - **Linux:** Urgency levels have the same effect.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().requestUserAttention();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-request-user-attention` permission (not included
   * in `core:window:default`).
   */
  async requestUserAttention(requestType) {
    let requestType_ = null;
    if (requestType) {
      if (requestType === UserAttentionType.Critical) {
        requestType_ = { type: "Critical" };
      } else {
        requestType_ = { type: "Informational" };
      }
    }
    return invoke3("plugin:window|request_user_attention", {
      label: this.label,
      value: requestType_
    });
  }
  /**
   * Updates the window resizable flag.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setResizable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-resizable` permission (not included
   * in `core:window:default`).
   */
  async setResizable(resizable) {
    return invoke3("plugin:window|set_resizable", {
      label: this.label,
      value: resizable
    });
  }
  /**
   * Enable or disable the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setEnabled(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-enabled` permission (not included
   * in `core:window:default`).
   *
   * @since 2.0.0
   */
  async setEnabled(enabled) {
    return invoke3("plugin:window|set_enabled", {
      label: this.label,
      value: enabled
    });
  }
  /**
   * Whether the window is enabled or disabled.
   *
   * A disabled window ignores all user input; see {@link Window.setEnabled}.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const enabled = await getCurrentWindow().isEnabled();
   * ```
   *
   * @returns `true` when the window accepts user input, `false` when it is disabled.
   *
   * @since 2.0.0
   */
  async isEnabled() {
    return invoke3("plugin:window|is_enabled", {
      label: this.label
    });
  }
  /**
   * Sets whether the window's native maximize button is enabled or not.
   * If resizable is set to false, this setting is ignored.
   *
   * #### Platform-specific
   *
   * - **macOS:** Disables the "zoom" button in the window titlebar, which is also used to enter fullscreen mode.
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMaximizable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-maximizable` permission (not included
   * in `core:window:default`).
   */
  async setMaximizable(maximizable) {
    return invoke3("plugin:window|set_maximizable", {
      label: this.label,
      value: maximizable
    });
  }
  /**
   * Sets whether the window's native minimize button is enabled or not.
   *
   * #### Platform-specific
   *
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMinimizable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-minimizable` permission (not included
   * in `core:window:default`).
   */
  async setMinimizable(minimizable) {
    return invoke3("plugin:window|set_minimizable", {
      label: this.label,
      value: minimizable
    });
  }
  /**
   * Sets whether the window's native close button is enabled or not.
   *
   * #### Platform-specific
   *
   * - **Linux:** GTK+ will do its best to convince the window manager not to show a close button. Depending on the system, this function may not have any effect when called on a window that is already visible
   * - **iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setClosable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-closable` permission (not included
   * in `core:window:default`).
   */
  async setClosable(closable) {
    return invoke3("plugin:window|set_closable", {
      label: this.label,
      value: closable
    });
  }
  /**
   * Sets the window title.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setTitle('Tauri');
   * ```
   *
   * @param title The new title
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-title` permission (not included
   * in `core:window:default`).
   */
  async setTitle(title) {
    return invoke3("plugin:window|set_title", {
      label: this.label,
      value: title
    });
  }
  /**
   * Maximizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().maximize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-maximize` permission (not included
   * in `core:window:default`).
   */
  async maximize() {
    return invoke3("plugin:window|maximize", {
      label: this.label
    });
  }
  /**
   * Unmaximizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().unmaximize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-unmaximize` permission (not included
   * in `core:window:default`).
   */
  async unmaximize() {
    return invoke3("plugin:window|unmaximize", {
      label: this.label
    });
  }
  /**
   * Toggles the window maximized state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().toggleMaximize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-toggle-maximize` permission (not included
   * in `core:window:default`).
   */
  async toggleMaximize() {
    return invoke3("plugin:window|toggle_maximize", {
      label: this.label
    });
  }
  /**
   * Minimizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().minimize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-minimize` permission (not included
   * in `core:window:default`).
   */
  async minimize() {
    return invoke3("plugin:window|minimize", {
      label: this.label
    });
  }
  /**
   * Unminimizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().unminimize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-unminimize` permission (not included
   * in `core:window:default`).
   */
  async unminimize() {
    return invoke3("plugin:window|unminimize", {
      label: this.label
    });
  }
  /**
   * Sets the window visibility to true.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().show();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-show` permission (not included
   * in `core:window:default`).
   */
  async show() {
    return invoke3("plugin:window|show", {
      label: this.label
    });
  }
  /**
   * Sets the window visibility to false.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().hide();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-hide` permission (not included
   * in `core:window:default`).
   */
  async hide() {
    return invoke3("plugin:window|hide", {
      label: this.label
    });
  }
  /**
   * Closes the window.
   *
   * Note this emits a closeRequested event so you can intercept it. To force window close, use {@link Window.destroy}.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().close();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-close` permission (not included
   * in `core:window:default`).
   */
  async close() {
    return invoke3("plugin:window|close", {
      label: this.label
    });
  }
  /**
   * Destroys the window. Behaves like {@link Window.close} but forces the window close instead of emitting a closeRequested event.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().destroy();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-destroy` permission (not included
   * in `core:window:default`).
   */
  async destroy() {
    return invoke3("plugin:window|destroy", {
      label: this.label
    });
  }
  /**
   * Whether the window should have borders and bars.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setDecorations(false);
   * ```
   *
   * @param decorations Whether the window should have borders and bars.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-decorations` permission (not included
   * in `core:window:default`).
   */
  async setDecorations(decorations) {
    return invoke3("plugin:window|set_decorations", {
      label: this.label,
      value: decorations
    });
  }
  /**
   * Whether or not the window should have shadow.
   *
   * #### Platform-specific
   *
   * - **Windows:**
   *   - `false` has no effect on decorated window, shadows are always ON.
   *   - `true` will make undecorated window have a 1px white border,
   * and on Windows 11, it will have a rounded corners.
   * - **Linux:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setShadow(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-shadow` permission (not included
   * in `core:window:default`).
   */
  async setShadow(enable) {
    return invoke3("plugin:window|set_shadow", {
      label: this.label,
      value: enable
    });
  }
  /**
   * Applies platform-specific window effects such as Mica, Acrylic, Blur or the
   * macOS vibrancy materials.
   *
   * Requires the window to be transparent, so create it with `transparent: true`
   * (or set `transparent` in `tauri.conf.json`). Give the page a transparent or
   * translucent background as well, otherwise the effect is hidden behind your own
   * background color.
   *
   * Conflicting effects are resolved by applying the first supported one and
   * ignoring the rest, so you can list a Windows and a macOS effect together.
   *
   * #### Platform-specific
   *
   * - **Windows:** If the window uses decorations or shadows, you may need
   *   [this workaround](https://github.com/tauri-apps/tao/issues/72#issuecomment-975607891).
   * - **Linux:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow, Effect, EffectState } from '@tauri-apps/api/window';
   *
   * await getCurrentWindow().setEffects({
   *   effects: [Effect.Mica, Effect.Acrylic, Effect.UnderWindowBackground],
   *   state: EffectState.Active,
   *   radius: 8
   * });
   * ```
   *
   * @param effects The effects to apply, see {@link Effects}.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-effects` permission (not included
   * in `core:window:default`).
   *
   * @since 2.0.0
   */
  async setEffects(effects) {
    return invoke3("plugin:window|set_effects", {
      label: this.label,
      value: effects
    });
  }
  /**
   * Clear any applied effects if possible.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().clearEffects();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-effects` permission (not included
   * in `core:window:default`), the same one used by {@link Window.setEffects}.
   *
   * @since 2.0.0
   */
  async clearEffects() {
    return invoke3("plugin:window|set_effects", {
      label: this.label,
      value: null
    });
  }
  /**
   * Whether the window should always be on top of other windows.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setAlwaysOnTop(true);
   * ```
   *
   * @param alwaysOnTop Whether the window should always be on top of other windows or not.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-always-on-top` permission (not included
   * in `core:window:default`).
   */
  async setAlwaysOnTop(alwaysOnTop) {
    return invoke3("plugin:window|set_always_on_top", {
      label: this.label,
      value: alwaysOnTop
    });
  }
  /**
   * Whether the window should always be below other windows.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setAlwaysOnBottom(true);
   * ```
   *
   * @param alwaysOnBottom Whether the window should always be below other windows or not.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-always-on-bottom` permission (not included
   * in `core:window:default`).
   */
  async setAlwaysOnBottom(alwaysOnBottom) {
    return invoke3("plugin:window|set_always_on_bottom", {
      label: this.label,
      value: alwaysOnBottom
    });
  }
  /**
   * Prevents the window contents from being captured by other apps.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setContentProtected(true);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-content-protected` permission (not included
   * in `core:window:default`).
   */
  async setContentProtected(protected_) {
    return invoke3("plugin:window|set_content_protected", {
      label: this.label,
      value: protected_
    });
  }
  /**
   * Resizes the window with a new inner size.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
   * await getCurrentWindow().setSize(new LogicalSize(600, 500));
   * ```
   *
   * @param size The logical or physical inner size.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-size` permission (not included
   * in `core:window:default`).
   */
  async setSize(size) {
    return invoke3("plugin:window|set_size", {
      label: this.label,
      value: size instanceof Size ? size : new Size(size)
    });
  }
  /**
   * Sets the window minimum inner size. If the `size` argument is not provided, the constraint is unset.
   * @example
   * ```typescript
   * import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMinSize(new PhysicalSize(600, 500));
   * ```
   *
   * @param size The logical or physical inner size, or `null` to unset the constraint.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-min-size` permission (not included
   * in `core:window:default`).
   */
  async setMinSize(size) {
    return invoke3("plugin:window|set_min_size", {
      label: this.label,
      value: size instanceof Size ? size : size ? new Size(size) : null
    });
  }
  /**
   * Sets the window maximum inner size. If the `size` argument is undefined, the constraint is unset.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMaxSize(new LogicalSize(600, 500));
   * ```
   *
   * @param size The logical or physical inner size, or `null` to unset the constraint.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-max-size` permission (not included
   * in `core:window:default`).
   */
  async setMaxSize(size) {
    return invoke3("plugin:window|set_max_size", {
      label: this.label,
      value: size instanceof Size ? size : size ? new Size(size) : null
    });
  }
  /**
   * Sets the window inner size constraints.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setSizeConstraints({ minWidth: 300 });
   * ```
   *
   * @param constraints The inner size constraints in **logical pixels**, or `null`
   * to unset every constraint. Each field is optional and independent, so
   * `{ minWidth: 300 }` constrains only the width.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-size-constraints` permission (not included
   * in `core:window:default`).
   */
  async setSizeConstraints(constraints) {
    function logical(pixel) {
      return pixel ? { Logical: pixel } : null;
    }
    return invoke3("plugin:window|set_size_constraints", {
      label: this.label,
      value: {
        minWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minWidth),
        minHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minHeight),
        maxWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxWidth),
        maxHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxHeight)
      }
    });
  }
  /**
   * Sets the window outer position.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
   * await getCurrentWindow().setPosition(new LogicalPosition(600, 500));
   * ```
   *
   * @param position The new position, in logical or physical pixels.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-position` permission (not included
   * in `core:window:default`).
   */
  async setPosition(position) {
    return invoke3("plugin:window|set_position", {
      label: this.label,
      value: position instanceof Position ? position : new Position(position)
    });
  }
  /**
   * Sets the window fullscreen state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setFullscreen(true);
   * ```
   *
   * @param fullscreen Whether the window should go to fullscreen or not.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-fullscreen` permission (not included
   * in `core:window:default`).
   */
  async setFullscreen(fullscreen) {
    return invoke3("plugin:window|set_fullscreen", {
      label: this.label,
      value: fullscreen
    });
  }
  /**
   * Sets the window as fullscreen on the monitor that contains the given physical position.
   *
   * Does nothing if no monitor contains the position.
   * @example
   * ```typescript
   * import { getCurrentWindow, availableMonitors } from '@tauri-apps/api/window';
   * const monitors = await availableMonitors();
   * if (monitors.length > 1) {
   *   await getCurrentWindow().setFullscreenOnMonitor(monitors[1].position);
   * }
   * ```
   *
   * @param position A physical position inside the target monitor, such as {@linkcode Monitor.position}.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-fullscreen-on-monitor` permission (not included
   * in `core:window:default`).
   *
   * @since 2.12.0
   */
  async setFullscreenOnMonitor(position) {
    return invoke3("plugin:window|set_fullscreen_on_monitor", {
      label: this.label,
      value: position
    });
  }
  /**
   * On macOS, Toggles a fullscreen mode that doesn’t require a new macOS space. Returns a boolean indicating whether the transition was successful (this won't work if the window was already in the native fullscreen).
   * This is how fullscreen used to work on macOS in versions before Lion. And allows the user to have a fullscreen window without using another space or taking control over the entire monitor.
   *
   * On other platforms, this is the same as {@link Window.setFullscreen}.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setSimpleFullscreen(true);
   * ```
   *
   * @param fullscreen Whether the window should go to simple fullscreen or not.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-simple-fullscreen` permission (not included
   * in `core:window:default`).
   *
   * @since 2.8.0
   */
  async setSimpleFullscreen(fullscreen) {
    return invoke3("plugin:window|set_simple_fullscreen", {
      label: this.label,
      value: fullscreen
    });
  }
  /**
   * Bring the window to front and focus.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setFocus();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-focus` permission (not included
   * in `core:window:default`).
   */
  async setFocus() {
    return invoke3("plugin:window|set_focus", {
      label: this.label
    });
  }
  /**
   * Sets whether the window can be focused.
   *
   * #### Platform-specific
   *
   * - **macOS**: If the window is already focused, it is not possible to unfocus it after calling `set_focusable(false)`.
   *   In this case, you might consider calling {@link Window.setFocus} but it will move the window to the back i.e. at the bottom in terms of z-order.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setFocusable(true);
   * ```
   *
   * @param focusable Whether the window can be focused.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-focusable` permission (not included
   * in `core:window:default`).
   */
  async setFocusable(focusable) {
    return invoke3("plugin:window|set_focusable", {
      label: this.label,
      value: focusable
    });
  }
  /**
   * Sets the window icon.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setIcon('/tauri/awesome.png');
   * ```
   *
   * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   *
   * @param icon Icon bytes or path to the icon file.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-icon` permission (not included
   * in `core:window:default`).
   */
  async setIcon(icon) {
    return invoke3("plugin:window|set_icon", {
      label: this.label,
      value: transformImage(icon)
    });
  }
  /**
   * Whether the window icon should be hidden from the taskbar or not.
   *
   * #### Platform-specific
   *
   * - **macOS:** Unsupported.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setSkipTaskbar(true);
   * ```
   *
   * @param skip true to hide window icon, false to show it.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-skip-taskbar` permission (not included
   * in `core:window:default`).
   */
  async setSkipTaskbar(skip) {
    return invoke3("plugin:window|set_skip_taskbar", {
      label: this.label,
      value: skip
    });
  }
  /**
   * Grabs the cursor, preventing it from leaving the window.
   *
   * There's no guarantee that the cursor will be hidden. You should
   * hide it by yourself if you want so.
   *
   * #### Platform-specific
   *
   * - **Linux:** Unsupported.
   * - **macOS:** This locks the cursor in a fixed location, which looks visually awkward.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorGrab(true);
   * ```
   *
   * @param grab `true` to grab the cursor icon, `false` to release it.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-cursor-grab` permission (not included
   * in `core:window:default`).
   */
  async setCursorGrab(grab) {
    return invoke3("plugin:window|set_cursor_grab", {
      label: this.label,
      value: grab
    });
  }
  /**
   * Modifies the cursor's visibility.
   *
   * #### Platform-specific
   *
   * - **Windows:** The cursor is only hidden within the confines of the window.
   * - **macOS:** The cursor is hidden as long as the window has input focus, even if the cursor is
   *   outside of the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorVisible(false);
   * ```
   *
   * @param visible If `false`, this will hide the cursor. If `true`, this will show the cursor.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-cursor-visible` permission (not included
   * in `core:window:default`).
   */
  async setCursorVisible(visible) {
    return invoke3("plugin:window|set_cursor_visible", {
      label: this.label,
      value: visible
    });
  }
  /**
   * Modifies the cursor icon of the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorIcon('help');
   * ```
   *
   * @param icon The new cursor icon.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-cursor-icon` permission (not included
   * in `core:window:default`).
   */
  async setCursorIcon(icon) {
    return invoke3("plugin:window|set_cursor_icon", {
      label: this.label,
      value: icon
    });
  }
  /**
   * Sets the window background color.
   *
   * #### Platform-specific:
   *
   * - **Windows:** alpha channel is ignored.
   * - **iOS / Android:** Unsupported.
   *
   * This sets the color of the window itself, which is what you see while the
   * webview is still loading or behind a transparent page. To also change the
   * webview background use {@link WebviewWindow.setBackgroundColor}.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setBackgroundColor('#2f2f2f');
   * // also accepts an RGB/RGBA tuple or an object
   * await getCurrentWindow().setBackgroundColor([47, 47, 47, 255]);
   * ```
   *
   * @param color The new background color, see {@link Color}.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-background-color` permission (not included
   * in `core:window:default`).
   *
   * @since 2.1.0
   */
  async setBackgroundColor(color) {
    return invoke3("plugin:window|set_background_color", {
      label: this.label,
      value: color
    });
  }
  /**
   * Changes the position of the cursor in window coordinates.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorPosition(new LogicalPosition(600, 300));
   * ```
   *
   * @param position The new cursor position.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-cursor-position` permission (not included
   * in `core:window:default`).
   */
  async setCursorPosition(position) {
    return invoke3("plugin:window|set_cursor_position", {
      label: this.label,
      value: position instanceof Position ? position : new Position(position)
    });
  }
  /**
   * Changes the cursor events behavior.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setIgnoreCursorEvents(true);
   * ```
   *
   * @param ignore `true` to ignore the cursor events; `false` to process them as usual.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-ignore-cursor-events` permission (not included
   * in `core:window:default`).
   */
  async setIgnoreCursorEvents(ignore) {
    return invoke3("plugin:window|set_ignore_cursor_events", {
      label: this.label,
      value: ignore
    });
  }
  /**
   * Starts dragging the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().startDragging();
   * ```
   *
   * @return A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-start-dragging` permission (not included
   * in `core:window:default`).
   */
  async startDragging() {
    return invoke3("plugin:window|start_dragging", {
      label: this.label
    });
  }
  /**
   * Starts resize-dragging the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().startResizeDragging();
   * ```
   *
   * @return A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-start-resize-dragging` permission (not included
   * in `core:window:default`).
   */
  async startResizeDragging(direction) {
    return invoke3("plugin:window|start_resize_dragging", {
      label: this.label,
      value: direction
    });
  }
  /**
   * Sets the badge count. It is app wide and not specific to this window.
   *
   * #### Platform-specific
   *
   * - **Windows**: Unsupported. Use {@linkcode Window.setOverlayIcon} instead.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setBadgeCount(5);
   * ```
   *
   * @param count The badge count. Use `undefined` to remove the badge.
   * @return A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-badge-count` permission (not included
   * in `core:window:default`).
   */
  async setBadgeCount(count) {
    return invoke3("plugin:window|set_badge_count", {
      label: this.label,
      value: count
    });
  }
  /**
   * Sets the badge label shown on the app's dock icon. **macOS only**
   *
   * Unlike {@linkcode Window.setBadgeCount}, which takes a number, this shows
   * arbitrary short text. It is app-wide and not specific to this window.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setBadgeLabel("Hello");
   * ```
   *
   * @param label The badge label. Use `undefined` to remove the badge.
   * @return A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-badge-label` permission (not included
   * in `core:window:default`).
   */
  async setBadgeLabel(label) {
    return invoke3("plugin:window|set_badge_label", {
      label: this.label,
      value: label
    });
  }
  /**
   * Sets the overlay icon. **Windows only**
   * The overlay icon can be set for every window.
   *
   *
   * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   *
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setOverlayIcon("/tauri/awesome.png");
   * ```
   *
   * @param icon Icon bytes or path to the icon file. Use `undefined` to remove the overlay icon.
   * @return A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-overlay-icon` permission (not included
   * in `core:window:default`).
   */
  async setOverlayIcon(icon) {
    return invoke3("plugin:window|set_overlay_icon", {
      label: this.label,
      value: icon ? transformImage(icon) : void 0
    });
  }
  /**
   * Sets the taskbar progress state.
   *
   * #### Platform-specific
   *
   * - **Linux / macOS**: Progress bar is app-wide and not specific to this window.
   * - **Linux**: Only supported desktop environments with `libunity` (e.g. GNOME).
   *
   * @example
   * ```typescript
   * import { getCurrentWindow, ProgressBarStatus } from '@tauri-apps/api/window';
   * await getCurrentWindow().setProgressBar({
   *   status: ProgressBarStatus.Normal,
   *   progress: 50,
   * });
   * ```
   *
   * @return A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-progress-bar` permission (not included
   * in `core:window:default`).
   */
  async setProgressBar(state) {
    return invoke3("plugin:window|set_progress_bar", {
      label: this.label,
      value: state
    });
  }
  /**
   * Sets whether the window should be visible on all workspaces or virtual desktops.
   *
   * #### Platform-specific
   *
   * - **Windows / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setVisibleOnAllWorkspaces(true);
   * ```
   *
   * @param visible Whether the window should follow the user across workspaces.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-visible-on-all-workspaces` permission (not included
   * in `core:window:default`).
   *
   * @since 2.0.0
   */
  async setVisibleOnAllWorkspaces(visible) {
    return invoke3("plugin:window|set_visible_on_all_workspaces", {
      label: this.label,
      value: visible
    });
  }
  /**
   * Sets the title bar style. **macOS only**.
   *
   * Use `transparent` or `overlay` to build a custom title bar: with `overlay` the
   * page extends under the title bar and only the traffic lights remain, so leave
   * room for them in your layout and pair it with {@link Window.startDragging} on a
   * draggable region.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setTitleBarStyle('overlay');
   * ```
   *
   * @param style The new title bar style, see {@link TitleBarStyle}.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-title-bar-style` permission (not included
   * in `core:window:default`).
   *
   * @since 2.0.0
   */
  async setTitleBarStyle(style) {
    return invoke3("plugin:window|set_title_bar_style", {
      label: this.label,
      value: style
    });
  }
  /**
   * Set window theme, pass in `null` or `undefined` to follow system theme
   *
   * #### Platform-specific
   *
   * - **Linux / macOS**: Theme is app-wide and not specific to this window.
   * - **iOS / Android:** Unsupported.
   *
   * Use {@link Window.theme} to read the effective theme and
   * {@link Window.onThemeChanged} to react to changes.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setTheme('dark');
   * // follow the system theme again
   * await getCurrentWindow().setTheme(null);
   * ```
   *
   * @param theme The theme to apply, or `null`/`undefined` to follow the system theme.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:window:allow-set-theme` permission (not included
   * in `core:window:default`).
   *
   * @since 2.0.0
   */
  async setTheme(theme) {
    return invoke3("plugin:window|set_theme", {
      label: this.label,
      value: theme
    });
  }
  // Listeners
  /**
   * Listen to window resize.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onResized(({ payload: size }) => {
   *  console.log('Window resized', size);
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listener is removed automatically when this window is destroyed,
   * so you do not need to unlisten just because the window is closing. Do call the
   * returned function when the listener's own scope ends, e.g. on page navigation
   * or when a component unmounts.
   */
  async onResized(handler) {
    return this.listen(TauriEvent.WINDOW_RESIZED, (e) => {
      e.payload = new PhysicalSize(e.payload);
      handler(e);
    });
  }
  /**
   * Listen to window move.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onMoved(({ payload: position }) => {
   *  console.log('Window moved', position);
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listener is removed automatically when this window is destroyed,
   * so you do not need to unlisten just because the window is closing. Do call the
   * returned function when the listener's own scope ends, e.g. on page navigation
   * or when a component unmounts.
   */
  async onMoved(handler) {
    return this.listen(TauriEvent.WINDOW_MOVED, (e) => {
      e.payload = new PhysicalPosition(e.payload);
      handler(e);
    });
  }
  /**
   * Listen to window close requested. Emitted when the user requests to closes the window.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * // `confirm` comes from the dialog plugin, which you have to add separately:
   * // `pnpm tauri add dialog`
   * import { confirm } from '@tauri-apps/plugin-dialog';
   * const unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
   *   const confirmed = await confirm('Are you sure?');
   *   if (!confirmed) {
   *     // user did not confirm closing the window; let's prevent it
   *     event.preventDefault();
   *   }
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listener is removed automatically when this window is destroyed,
   * so you do not need to unlisten just because the window is closing. Do call the
   * returned function when the listener's own scope ends, e.g. on page navigation
   * or when a component unmounts.
   */
  async onCloseRequested(handler) {
    return this.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async (event) => {
      const evt = new CloseRequestedEvent(event);
      await handler(evt);
      if (!evt.isPreventDefault()) {
        await this.destroy();
      }
    });
  }
  /**
   * Listen to a file drop event.
   * The listener is triggered when the user hovers the selected files on the webview,
   * drops the files or cancels the operation.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onDragDropEvent((event) => {
   *  if (event.payload.type === 'over') {
   *    console.log('User hovering', event.payload.position);
   *  } else if (event.payload.type === 'drop') {
   *    console.log('User dropped', event.payload.paths);
   *  } else {
   *    console.log('File drop cancelled');
   *  }
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listener is removed automatically when this window is destroyed,
   * so you do not need to unlisten just because the window is closing. Do call the
   * returned function when the listener's own scope ends, e.g. on page navigation
   * or when a component unmounts.
   */
  async onDragDropEvent(handler) {
    const unlistenDrag = await this.listen(TauriEvent.DRAG_ENTER, (event) => {
      handler({
        ...event,
        payload: {
          type: "enter",
          paths: event.payload.paths,
          position: new PhysicalPosition(event.payload.position)
        }
      });
    });
    const unlistenDragOver = await this.listen(TauriEvent.DRAG_OVER, (event) => {
      handler({
        ...event,
        payload: {
          type: "over",
          position: new PhysicalPosition(event.payload.position)
        }
      });
    });
    const unlistenDrop = await this.listen(TauriEvent.DRAG_DROP, (event) => {
      handler({
        ...event,
        payload: {
          type: "drop",
          paths: event.payload.paths,
          position: new PhysicalPosition(event.payload.position)
        }
      });
    });
    const unlistenCancel = await this.listen(TauriEvent.DRAG_LEAVE, (event) => {
      handler({ ...event, payload: { type: "leave" } });
    });
    return async () => {
      await Promise.all([
        unlistenDrag(),
        unlistenDrop(),
        unlistenDragOver(),
        unlistenCancel()
      ]);
    };
  }
  /**
   * Listen to window focus change.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
   *  console.log('Focus changed, window is focused? ' + focused);
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listener is removed automatically when this window is destroyed,
   * so you do not need to unlisten just because the window is closing. Do call the
   * returned function when the listener's own scope ends, e.g. on page navigation
   * or when a component unmounts.
   */
  async onFocusChanged(handler) {
    const unlistenFocus = await this.listen(TauriEvent.WINDOW_FOCUS, (event) => {
      handler({ ...event, payload: true });
    });
    const unlistenBlur = await this.listen(TauriEvent.WINDOW_BLUR, (event) => {
      handler({ ...event, payload: false });
    });
    return async () => {
      await Promise.all([unlistenFocus(), unlistenBlur()]);
    };
  }
  /**
   * Listen to window scale change. Emitted when the window's scale factor has changed.
   * The following user actions can cause DPI changes:
   * - Changing the display's resolution.
   * - Changing the display's scale factor (e.g. in Control Panel on Windows).
   * - Moving the window to a display with a different scale factor.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onScaleChanged(({ payload }) => {
   *  console.log('Scale changed', payload.scaleFactor, payload.size);
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listener is removed automatically when this window is destroyed,
   * so you do not need to unlisten just because the window is closing. Do call the
   * returned function when the listener's own scope ends, e.g. on page navigation
   * or when a component unmounts.
   */
  async onScaleChanged(handler) {
    return this.listen(TauriEvent.WINDOW_SCALE_FACTOR_CHANGED, (e) => {
      e.payload.size = new PhysicalSize(e.payload.size);
      handler(e);
    });
  }
  /**
   * Listen to the system theme change.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onThemeChanged(({ payload: theme }) => {
   *  console.log('New theme: ' + theme);
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listener is removed automatically when this window is destroyed,
   * so you do not need to unlisten just because the window is closing. Do call the
   * returned function when the listener's own scope ends, e.g. on page navigation
   * or when a component unmounts.
   */
  async onThemeChanged(handler) {
    return this.listen(TauriEvent.WINDOW_THEME_CHANGED, handler);
  }
};
var BackgroundThrottlingPolicy;
(function(BackgroundThrottlingPolicy2) {
  BackgroundThrottlingPolicy2["Disabled"] = "disabled";
  BackgroundThrottlingPolicy2["Throttle"] = "throttle";
  BackgroundThrottlingPolicy2["Suspend"] = "suspend";
})(BackgroundThrottlingPolicy || (BackgroundThrottlingPolicy = {}));
var ScrollBarStyle;
(function(ScrollBarStyle2) {
  ScrollBarStyle2["Default"] = "default";
  ScrollBarStyle2["FluentOverlay"] = "fluentOverlay";
})(ScrollBarStyle || (ScrollBarStyle = {}));
var Effect;
(function(Effect2) {
  Effect2["AppearanceBased"] = "appearanceBased";
  Effect2["Light"] = "light";
  Effect2["Dark"] = "dark";
  Effect2["MediumLight"] = "mediumLight";
  Effect2["UltraDark"] = "ultraDark";
  Effect2["Titlebar"] = "titlebar";
  Effect2["Selection"] = "selection";
  Effect2["Menu"] = "menu";
  Effect2["Popover"] = "popover";
  Effect2["Sidebar"] = "sidebar";
  Effect2["HeaderView"] = "headerView";
  Effect2["Sheet"] = "sheet";
  Effect2["WindowBackground"] = "windowBackground";
  Effect2["HudWindow"] = "hudWindow";
  Effect2["FullScreenUI"] = "fullScreenUI";
  Effect2["Tooltip"] = "tooltip";
  Effect2["ContentBackground"] = "contentBackground";
  Effect2["UnderWindowBackground"] = "underWindowBackground";
  Effect2["UnderPageBackground"] = "underPageBackground";
  Effect2["LiquidGlassRegular"] = "liquidGlassRegular";
  Effect2["LiquidGlassClear"] = "liquidGlassClear";
  Effect2["Mica"] = "mica";
  Effect2["Blur"] = "blur";
  Effect2["Acrylic"] = "acrylic";
  Effect2["Tabbed"] = "tabbed";
  Effect2["TabbedDark"] = "tabbedDark";
  Effect2["TabbedLight"] = "tabbedLight";
})(Effect || (Effect = {}));
var EffectState;
(function(EffectState2) {
  EffectState2["FollowsWindowActiveState"] = "followsWindowActiveState";
  EffectState2["Active"] = "active";
  EffectState2["Inactive"] = "inactive";
})(EffectState || (EffectState = {}));

// ../parity/proj/node_modules/@tauri-apps/api/webview.js
function getCurrentWebview() {
  return new Webview(getCurrentWindow(), window.__TAURI_INTERNALS__.metadata.currentWebview.label, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  });
}
async function getAllWebviews() {
  return invoke3("plugin:webview|get_all_webviews").then((webviews) => webviews.map((w) => new Webview(new Window(w.windowLabel, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  }), w.label, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  })));
}
var localTauriEvents2 = ["tauri://created", "tauri://error"];
var Webview = class {
  /**
   * Creates a new Webview.
   * @example
   * ```typescript
   * import { Window } from '@tauri-apps/api/window'
   * import { Webview } from '@tauri-apps/api/webview'
   * const appWindow = new Window('my-label')
   *
   * appWindow.once('tauri://created', async function() {
   *   const webview = new Webview(appWindow, 'my-label', {
   *     url: 'https://github.com/tauri-apps/tauri',
   *
   *     // create a webview with specific logical position and size
   *     x: 0,
   *     y: 0,
   *     width: 800,
   *     height: 600,
   *   });
   *
   *   webview.once('tauri://created', function () {
   *     // webview successfully created
   *   });
   *   webview.once('tauri://error', function (e) {
   *     // an error happened creating the webview
   *   });
   * });
   * ```
   *
   * @param window the window to add this webview to.
   * @param label The unique webview label. Must be alphanumeric: `a-zA-Z-/:_`.
   * @param options The webview configuration, see {@link WebviewOptions}.
   * @returns The {@link Webview} instance to communicate with the webview.
   *
   * @remarks Requires the `unstable` Cargo feature on the `tauri` crate
   * (`tauri = { version = "2", features = ["unstable"] }`), otherwise the call
   * rejects with an "unstable feature not supported" error. It also requires the
   * `core:webview:allow-create-webview` permission, which is not included in
   * `core:webview:default`.
   */
  constructor(window2, label, options) {
    this.window = window2;
    this.label = label;
    this.listeners = /* @__PURE__ */ Object.create(null);
    if (!(options === null || options === void 0 ? void 0 : options.skip)) {
      invoke3("plugin:webview|create_webview", {
        windowLabel: window2.label,
        options: {
          ...options,
          label
        }
      }).then(async () => this.emit("tauri://created")).catch(async (e) => this.emit("tauri://error", e));
    }
  }
  /**
   * Gets the Webview for the webview associated with the given label.
   * @example
   * ```typescript
   * import { Webview } from '@tauri-apps/api/webview';
   * const mainWebview = Webview.getByLabel('main');
   * ```
   *
   * @param label The webview label.
   * @returns The Webview instance to communicate with the webview or null if the webview doesn't exist.
   */
  static async getByLabel(label) {
    var _a;
    return (_a = (await getAllWebviews()).find((w) => w.label === label)) !== null && _a !== void 0 ? _a : null;
  }
  /**
   * Get an instance of `Webview` for the current webview.
   */
  static getCurrent() {
    return getCurrentWebview();
  }
  /**
   * Gets a list of instances of `Webview` for all available webviews.
   */
  static async getAll() {
    return getAllWebviews();
  }
  /**
   * Listen to an emitted event on this webview.
   *
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * const unlisten = await getCurrentWebview().listen<string>('state-changed', (event) => {
   *   console.log(`Got error: ${payload}`);
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param handler Event handler.
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listener is removed automatically when this webview is destroyed,
   * so you do not need to unlisten just because the webview is closing. Do call the
   * returned function when the listener's own scope ends, e.g. on page navigation
   * or when a component unmounts.
   */
  async listen(event, handler) {
    if (this._handleTauriEvent(event, handler)) {
      return () => {
        const listeners2 = this.listeners[event];
        listeners2.splice(listeners2.indexOf(handler), 1);
      };
    }
    return listen2(event, handler, {
      target: { kind: "Webview", label: this.label }
    });
  }
  /**
   * Listen to an emitted event on this webview only once.
   *
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * const unlisten = await getCurrentWebview().once<null>('initialized', (event) => {
   *   console.log(`Webview initialized!`);
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param handler Event handler.
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listener removes itself after the first event and is also removed
   * automatically when this webview is destroyed. Do call the returned function if
   * the listener's own scope ends before the event arrives.
   */
  async once(event, handler) {
    if (this._handleTauriEvent(event, handler)) {
      return () => {
        const listeners2 = this.listeners[event];
        listeners2.splice(listeners2.indexOf(handler), 1);
      };
    }
    return once(event, handler, {
      target: { kind: "Webview", label: this.label }
    });
  }
  /**
   * Emits an event to all {@link EventTarget|targets}.
   *
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * await getCurrentWebview().emit('webview-loaded', { loggedIn: true, token: 'authToken' });
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param payload Event payload.
   */
  async emit(event, payload) {
    if (localTauriEvents2.includes(event)) {
      for (const handler of this.listeners[event] || []) {
        handler({
          event,
          id: -1,
          payload
        });
      }
      return;
    }
    return emit(event, payload);
  }
  /**
   * Emits an event to all {@link EventTarget|targets} matching the given target.
   *
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * await getCurrentWebview().emitTo('main', 'webview-loaded', { loggedIn: true, token: 'authToken' });
   * ```
   *
   * @param target Label of the target Window/Webview/WebviewWindow or raw {@link EventTarget} object.
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param payload Event payload.
   */
  async emitTo(target, event, payload) {
    if (localTauriEvents2.includes(event)) {
      for (const handler of this.listeners[event] || []) {
        handler({
          event,
          id: -1,
          payload
        });
      }
      return;
    }
    return emitTo(target, event, payload);
  }
  /** @ignore */
  _handleTauriEvent(event, handler) {
    if (localTauriEvents2.includes(event)) {
      if (!(event in this.listeners)) {
        this.listeners[event] = [handler];
      } else {
        this.listeners[event].push(handler);
      }
      return true;
    }
    return false;
  }
  // Getters
  /**
   * The position of the top-left hand corner of the webview's client area relative to the top-left hand corner of the desktop.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * const position = await getCurrentWebview().position();
   * ```
   *
   * @returns The webview's position, in physical pixels.
   *
   * @remarks Uses the `core:webview:allow-webview-position` permission, which is
   * part of `core:webview:default`.
   */
  async position() {
    return invoke3("plugin:webview|webview_position", {
      label: this.label
    }).then((p2) => new PhysicalPosition(p2));
  }
  /**
   * The physical size of the webview's client area.
   * The client area is the content of the webview, excluding the title bar and borders.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * const size = await getCurrentWebview().size();
   * ```
   *
   * @returns The webview's size, in physical pixels.
   *
   * @remarks Uses the `core:webview:allow-webview-size` permission, which is part
   * of `core:webview:default`.
   */
  async size() {
    return invoke3("plugin:webview|webview_size", {
      label: this.label
    }).then((s) => new PhysicalSize(s));
  }
  // Setters
  /**
   * Closes the webview.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * await getCurrentWebview().close();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:webview:allow-webview-close` permission (not
   * included in `core:webview:default`).
   */
  async close() {
    return invoke3("plugin:webview|webview_close", {
      label: this.label
    });
  }
  /**
   * Resizes the webview.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * import { LogicalSize } from '@tauri-apps/api/dpi';
   * await getCurrentWebview().setSize(new LogicalSize(600, 500));
   * ```
   *
   * @param size The logical or physical size.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:webview:allow-set-webview-size` permission (not
   * included in `core:webview:default`).
   */
  async setSize(size) {
    return invoke3("plugin:webview|set_webview_size", {
      label: this.label,
      value: size instanceof Size ? size : new Size(size)
    });
  }
  /**
   * Sets the webview position.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * import { LogicalPosition } from '@tauri-apps/api/dpi';
   * await getCurrentWebview().setPosition(new LogicalPosition(600, 500));
   * ```
   *
   * @param position The new position, in logical or physical pixels, relative to
   * the top-left corner of the hosting window.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:webview:allow-set-webview-position` permission (not
   * included in `core:webview:default`).
   */
  async setPosition(position) {
    return invoke3("plugin:webview|set_webview_position", {
      label: this.label,
      value: position instanceof Position ? position : new Position(position)
    });
  }
  /**
   * Bring the webview to front and focus.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * await getCurrentWebview().setFocus();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:webview:allow-set-webview-focus` permission (not
   * included in `core:webview:default`).
   */
  async setFocus() {
    return invoke3("plugin:webview|set_webview_focus", {
      label: this.label
    });
  }
  /**
   * Sets whether the webview should automatically grow and shrink its size and position when the parent window resizes.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * await getCurrentWebview().setAutoResize(true);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:webview:allow-set-webview-auto-resize` permission
   * (not included in `core:webview:default`).
   */
  async setAutoResize(autoResize) {
    return invoke3("plugin:webview|set_webview_auto_resize", {
      label: this.label,
      value: autoResize
    });
  }
  /**
   * Hide the webview.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * await getCurrentWebview().hide();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:webview:allow-webview-hide` permission (not
   * included in `core:webview:default`).
   */
  async hide() {
    return invoke3("plugin:webview|webview_hide", {
      label: this.label
    });
  }
  /**
   * Show the webview.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * await getCurrentWebview().show();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:webview:allow-webview-show` permission (not
   * included in `core:webview:default`).
   */
  async show() {
    return invoke3("plugin:webview|webview_show", {
      label: this.label
    });
  }
  /**
   * Set webview zoom level.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * await getCurrentWebview().setZoom(1.5);
   * ```
   *
   * @param scaleFactor The zoom level, where `1` is 100%.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:webview:allow-set-webview-zoom` permission (not
   * included in `core:webview:default`).
   */
  async setZoom(scaleFactor) {
    return invoke3("plugin:webview|set_webview_zoom", {
      label: this.label,
      value: scaleFactor
    });
  }
  /**
   * Moves this webview to the window with the given label.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * await getCurrentWebview().reparent('other-window');
   * ```
   *
   * @param window The target window, or its label.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:webview:allow-reparent` permission (not included in
   * `core:webview:default`).
   */
  async reparent(window2) {
    return invoke3("plugin:webview|reparent", {
      label: this.label,
      window: typeof window2 === "string" ? window2 : window2.label
    });
  }
  /**
   * Clears all browsing data for this webview: cookies, localStorage, IndexedDB,
   * caches and any other data the webview stores for the loaded origins.
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * await getCurrentWebview().clearAllBrowsingData();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:webview:allow-clear-all-browsing-data` permission
   * (not included in `core:webview:default`).
   */
  async clearAllBrowsingData() {
    return invoke3("plugin:webview|clear_all_browsing_data");
  }
  /**
   * Specify the webview background color.
   *
   * #### Platform-specific:
   *
   * - **macOS / iOS**: Not implemented.
   * - **Windows**:
   *   - On Windows 7, transparency is not supported and the alpha value will be ignored.
   *   - On Windows higher than 7: translucent colors are not supported so any alpha value other than `0` will be replaced by `255`
   *
   * @example
   * ```typescript
   * import { getCurrentWebview } from '@tauri-apps/api/webview';
   * await getCurrentWebview().setBackgroundColor('#2f2f2f');
   * // or with an RGBA tuple, or `null` to restore the default background
   * await getCurrentWebview().setBackgroundColor([47, 47, 47, 255]);
   * ```
   *
   * @param color The new background color, or `null` to reset it.
   * @returns A promise indicating the success or failure of the operation.
   *
   * @remarks Requires the `core:webview:allow-set-webview-background-color`
   * permission (not included in `core:webview:default`).
   *
   * @since 2.1.0
   */
  async setBackgroundColor(color) {
    return invoke3("plugin:webview|set_webview_background_color", {
      label: this.label,
      value: color
    });
  }
  // Listeners
  /**
   * Listen to a file drop event.
   * The listener is triggered when the user hovers the selected files on the webview,
   * drops the files or cancels the operation.
   *
   * @example
   * ```typescript
   * import { getCurrentWebview } from "@tauri-apps/api/webview";
   * const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
   *  if (event.payload.type === 'over') {
   *    console.log('User hovering', event.payload.position);
   *  } else if (event.payload.type === 'drop') {
   *    console.log('User dropped', event.payload.paths);
   *  } else {
   *    console.log('File drop cancelled');
   *  }
   * });
   *
   * // call unlisten when your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * When the debugger panel is open, the drop position of this event may be inaccurate due to a known limitation.
   * To retrieve the correct drop position, please detach the debugger.
   *
   * @returns A promise resolving to a function to unlisten to the event.
   *
   * @remarks The listeners are removed automatically when this webview is
   * destroyed. Do call the returned function when the listener's own scope ends,
   * e.g. on page navigation or when a component unmounts.
   */
  async onDragDropEvent(handler) {
    const unlistenDragEnter = await this.listen(TauriEvent.DRAG_ENTER, (event) => {
      handler({
        ...event,
        payload: {
          type: "enter",
          paths: event.payload.paths,
          position: new PhysicalPosition(event.payload.position)
        }
      });
    });
    const unlistenDragOver = await this.listen(TauriEvent.DRAG_OVER, (event) => {
      handler({
        ...event,
        payload: {
          type: "over",
          position: new PhysicalPosition(event.payload.position)
        }
      });
    });
    const unlistenDragDrop = await this.listen(TauriEvent.DRAG_DROP, (event) => {
      handler({
        ...event,
        payload: {
          type: "drop",
          paths: event.payload.paths,
          position: new PhysicalPosition(event.payload.position)
        }
      });
    });
    const unlistenDragLeave = await this.listen(TauriEvent.DRAG_LEAVE, (event) => {
      handler({ ...event, payload: { type: "leave" } });
    });
    return async () => {
      await Promise.all([
        unlistenDragEnter(),
        unlistenDragDrop(),
        unlistenDragOver(),
        unlistenDragLeave()
      ]);
    };
  }
};

// src/shell/uiScale.ts
function uiScaleFactor(percent) {
  const p2 = !percent || !Number.isFinite(percent) ? 100 : percent;
  return Math.min(130, Math.max(80, Math.round(p2))) / 100;
}
var backendSupport = null;
var applied = 1;
function backendScalesWindows() {
  if (!backendSupport) {
    backendSupport = invoke2("get_ui_scale_support_cmd").then((v) => v === true).catch(() => false);
  }
  return backendSupport;
}
function applyUiScale(percent) {
  const factor = uiScaleFactor(percent);
  document.documentElement.style.setProperty("--lens-ui-scale", String(factor));
  if (factor === applied) return;
  void backendScalesWindows().then((ok) => {
    if (!ok || factor === applied) return;
    applied = factor;
    getCurrentWebview().setZoom(factor).catch(() => {
      applied = 1;
    });
  });
}

// src/shell/dockEdge.ts
function normalizeDockEdge(raw) {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "top" || v === "left" || v === "right" ? v : "bottom";
}
function applyDockEdge(raw) {
  document.documentElement.dataset.dockEdge = normalizeDockEdge(raw);
}

// src/shell/keyhookResponder.ts
var installed = false;
function installKeyhookResponder() {
  if (installed) return;
  installed = true;
  listen("lens://keyhook-ping", (e) => {
    const seq2 = e.payload?.seq;
    if (typeof seq2 === "number") invoke2("keyhook_ack_cmd", { seq: seq2 }).catch(() => {
    });
  }).catch(() => {
    installed = false;
  });
}

// src/hooks/useLensState.ts
function applyThemeToDocument(cfg, winTheme) {
  const root = document.documentElement;
  const activeAccent = cfg.theme.accentMode === "custom" ? cfg.theme.customAccent : winTheme.accentHex;
  root.dataset.preset = cfg.theme.preset;
  root.dataset.scheme = packById(cfg.theme.preset)?.scheme ?? "dark";
  root.dataset.motion = cfg.theme.motion === "reduce" || cfg.theme.motion === "full" ? cfg.theme.motion : "";
  root.dataset.contrast = cfg.theme.contrast === "high" ? "high" : "";
  setLocale(cfg.theme.locale);
  const pack = packById(cfg.theme.preset);
  if (pack?.base) {
    root.style.setProperty("--lens-pack-base", pack.base);
    root.style.setProperty(
      "--lens-pack-elevated",
      pack.scheme === "light" ? "#FFFFFF" : lighten(pack.base, 0.045)
    );
  } else {
    root.style.removeProperty("--lens-pack-base");
    root.style.removeProperty("--lens-pack-elevated");
  }
  root.style.setProperty("--lens-accent", activeAccent);
  root.style.setProperty("--lens-windows-accent", winTheme.accentHex);
  root.style.setProperty("--lens-glass-opacity", String(cfg.theme.glassOpacity));
  root.style.setProperty("--lens-glass-opacity-pct", `${Math.round(cfg.theme.glassOpacity * 100)}%`);
  root.style.setProperty("--lens-blur", `${cfg.theme.blurPx}px`);
  root.style.setProperty("--lens-radius", `${cfg.theme.borderRadius}px`);
  root.style.setProperty(
    "--lens-accent-tint",
    `${Math.round(cfg.theme.accentTintStrength * 100)}%`
  );
  root.style.setProperty("--dock-icon-size", `${cfg.dock.iconSize}px`);
  root.style.setProperty("--dock-hover-scale", String(cfg.dock.hoverScale));
  root.style.setProperty("--dock-hover-lift", `${cfg.dock.hoverLift}px`);
  const fontMap = {
    "rounded-arial": '"Arial Rounded MT Bold", "Arial Rounded", "Segoe UI Variable", system-ui, sans-serif',
    "inter-sans": '"Segoe UI Variable Display", "Inter", system-ui, -apple-system, sans-serif',
    "tech-mono": '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
    "editorial-serif": 'Georgia, Cambria, "Times New Roman", serif'
  };
  const chosenFont = fontMap[cfg.theme.fontFamily || "rounded-arial"] || fontMap["rounded-arial"];
  root.style.setProperty("--font-sans", chosenFont);
  document.body.style.fontFamily = chosenFont;
  applyUiScale(cfg.theme.uiScale);
  applyDockEdge(cfg.dock.position);
  installKeyhookResponder();
  let styleEl = document.getElementById("lens-custom-css");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "lens-custom-css";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = cfg.theme.customCss || "";
}
function useLensState() {
  const [config2, setConfig] = (0, import_react2.useState)(null);
  const [winTheme, setWinTheme] = (0, import_react2.useState)({
    accentHex: "#2D7D9A",
    accentR: 45,
    accentG: 125,
    accentB: 154,
    appsUseLightTheme: false,
    systemUsesLightTheme: false,
    transparencyEnabled: true,
    osFamily: "windows",
    windowsBuild: 0
  });
  (0, import_react2.useEffect)(() => {
    let mounted = true;
    Promise.all([
      invoke2("get_config"),
      invoke2("get_windows_theme")
    ]).then(async ([cfg, theme]) => {
      await loadCustomPacksFromDisk();
      if (!mounted) return;
      setConfig(cfg);
      setWinTheme(theme);
      applyThemeToDocument(cfg, theme);
    }).catch(console.error);
    const unlistenCfg = listen("lens://config-updated", (event) => {
      ensurePackLoaded(event.payload.theme.preset).finally(() => {
        if (mounted) setConfig({ ...event.payload });
      });
    });
    const unlistenTheme = listen("lens://windows-theme", (event) => {
      setWinTheme(event.payload);
    });
    return () => {
      mounted = false;
      unlistenCfg.then((fn) => fn());
      unlistenTheme.then((fn) => fn());
    };
  }, []);
  (0, import_react2.useEffect)(() => {
    if (config2) {
      applyThemeToDocument(config2, winTheme);
    }
  }, [config2, winTheme]);
  const updateConfig = (0, import_react2.useCallback)(async (incoming) => {
    const surfaceHex = packById(incoming.theme.preset)?.base ?? "";
    const next = (incoming.theme.surfaceHex ?? "") === surfaceHex ? incoming : { ...incoming, theme: { ...incoming.theme, surfaceHex } };
    setConfig(next);
    await invoke2("save_config_cmd", { newConfig: next });
  }, []);
  return { config: config2, winTheme, updateConfig };
}

// src/snip/Select.tsx
var import_react6 = __toESM(require_react(), 1);

// ../parity/proj/node_modules/lucide-react/dist/esm/createLucideIcon.js
var import_react4 = __toESM(require_react(), 1);

// ../parity/proj/node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();

// ../parity/proj/node_modules/lucide-react/dist/esm/Icon.js
var import_react3 = __toESM(require_react(), 1);

// ../parity/proj/node_modules/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// ../parity/proj/node_modules/lucide-react/dist/esm/Icon.js
var Icon = (0, import_react3.forwardRef)(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => {
    return (0, import_react3.createElement)(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
        className: mergeClasses("lucide", className),
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => (0, import_react3.createElement)(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

// ../parity/proj/node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = (0, import_react4.forwardRef)(
    ({ className, ...props }, ref) => (0, import_react4.createElement)(Icon, {
      ref,
      iconNode,
      className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
      ...props
    })
  );
  Component.displayName = `${iconName}`;
  return Component;
};

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/app-window.js
var __iconNode = [
  ["rect", { x: "2", y: "4", width: "20", height: "16", rx: "2", key: "izxlao" }],
  ["path", { d: "M10 4v4", key: "pp8u80" }],
  ["path", { d: "M2 8h20", key: "d11cs7" }],
  ["path", { d: "M6 4v4", key: "1svtjw" }]
];
var AppWindow = createLucideIcon("AppWindow", __iconNode);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/arrow-up-right.js
var __iconNode2 = [
  ["path", { d: "M7 7h10v10", key: "1tivn9" }],
  ["path", { d: "M7 17 17 7", key: "1vkiza" }]
];
var ArrowUpRight = createLucideIcon("ArrowUpRight", __iconNode2);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/camera.js
var __iconNode3 = [
  [
    "path",
    {
      d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
      key: "1tc9qg"
    }
  ],
  ["circle", { cx: "12", cy: "13", r: "3", key: "1vg3eu" }]
];
var Camera = createLucideIcon("Camera", __iconNode3);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/check.js
var __iconNode4 = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]];
var Check = createLucideIcon("Check", __iconNode4);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/clock.js
var __iconNode5 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["polyline", { points: "12 6 12 12 16 14", key: "68esgv" }]
];
var Clock = createLucideIcon("Clock", __iconNode5);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/copy.js
var __iconNode6 = [
  ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2", key: "17jyea" }],
  ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2", key: "zix9uf" }]
];
var Copy = createLucideIcon("Copy", __iconNode6);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/crop.js
var __iconNode7 = [
  ["path", { d: "M6 2v14a2 2 0 0 0 2 2h14", key: "ron5a4" }],
  ["path", { d: "M18 22V8a2 2 0 0 0-2-2H2", key: "7s9ehn" }]
];
var Crop = createLucideIcon("Crop", __iconNode7);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/droplets.js
var __iconNode8 = [
  [
    "path",
    {
      d: "M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z",
      key: "1ptgy4"
    }
  ],
  [
    "path",
    {
      d: "M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97",
      key: "1sl1rz"
    }
  ]
];
var Droplets = createLucideIcon("Droplets", __iconNode8);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/eraser.js
var __iconNode9 = [
  [
    "path",
    {
      d: "m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21",
      key: "182aya"
    }
  ],
  ["path", { d: "M22 21H7", key: "t4ddhn" }],
  ["path", { d: "m5 11 9 9", key: "1mo9qw" }]
];
var Eraser = createLucideIcon("Eraser", __iconNode9);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/grid-3x3.js
var __iconNode10 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M3 9h18", key: "1pudct" }],
  ["path", { d: "M3 15h18", key: "5xshup" }],
  ["path", { d: "M9 3v18", key: "fh3hqa" }],
  ["path", { d: "M15 3v18", key: "14nvp0" }]
];
var Grid3x3 = createLucideIcon("Grid3x3", __iconNode10);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/grip-vertical.js
var __iconNode11 = [
  ["circle", { cx: "9", cy: "12", r: "1", key: "1vctgf" }],
  ["circle", { cx: "9", cy: "5", r: "1", key: "hp0tcf" }],
  ["circle", { cx: "9", cy: "19", r: "1", key: "fkjjf6" }],
  ["circle", { cx: "15", cy: "12", r: "1", key: "1tmaij" }],
  ["circle", { cx: "15", cy: "5", r: "1", key: "19l28e" }],
  ["circle", { cx: "15", cy: "19", r: "1", key: "f4zoj3" }]
];
var GripVertical = createLucideIcon("GripVertical", __iconNode11);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/highlighter.js
var __iconNode12 = [
  ["path", { d: "m9 11-6 6v3h9l3-3", key: "1a3l36" }],
  ["path", { d: "m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4", key: "14a9rk" }]
];
var Highlighter = createLucideIcon("Highlighter", __iconNode12);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/languages.js
var __iconNode13 = [
  ["path", { d: "m5 8 6 6", key: "1wu5hv" }],
  ["path", { d: "m4 14 6-6 2-3", key: "1k1g8d" }],
  ["path", { d: "M2 5h12", key: "or177f" }],
  ["path", { d: "M7 2h1", key: "1t2jsx" }],
  ["path", { d: "m22 22-5-10-5 10", key: "don7ne" }],
  ["path", { d: "M14 18h6", key: "1m8k6r" }]
];
var Languages = createLucideIcon("Languages", __iconNode13);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/lasso.js
var __iconNode14 = [
  ["path", { d: "M7 22a5 5 0 0 1-2-4", key: "umushi" }],
  [
    "path",
    {
      d: "M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1",
      key: "146dds"
    }
  ],
  ["path", { d: "M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", key: "bq3ynw" }]
];
var Lasso = createLucideIcon("Lasso", __iconNode14);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/list-ordered.js
var __iconNode15 = [
  ["path", { d: "M10 12h11", key: "6m4ad9" }],
  ["path", { d: "M10 18h11", key: "11hvi2" }],
  ["path", { d: "M10 6h11", key: "c7qv1k" }],
  ["path", { d: "M4 10h2", key: "16xx2s" }],
  ["path", { d: "M4 6h1v4", key: "cnovpq" }],
  ["path", { d: "M6 18H4c0-1 2-2 2-3s-1-1.5-2-1", key: "m9a95d" }]
];
var ListOrdered = createLucideIcon("ListOrdered", __iconNode15);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/monitor.js
var __iconNode16 = [
  ["rect", { width: "20", height: "14", x: "2", y: "3", rx: "2", key: "48i651" }],
  ["line", { x1: "8", x2: "16", y1: "21", y2: "21", key: "1svkeh" }],
  ["line", { x1: "12", x2: "12", y1: "17", y2: "21", key: "vw1qmm" }]
];
var Monitor = createLucideIcon("Monitor", __iconNode16);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/mouse-pointer-2.js
var __iconNode17 = [
  [
    "path",
    {
      d: "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z",
      key: "edeuup"
    }
  ]
];
var MousePointer2 = createLucideIcon("MousePointer2", __iconNode17);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/mouse-pointer-click.js
var __iconNode18 = [
  ["path", { d: "M14 4.1 12 6", key: "ita8i4" }],
  ["path", { d: "m5.1 8-2.9-.8", key: "1go3kf" }],
  ["path", { d: "m6 12-1.9 2", key: "mnht97" }],
  ["path", { d: "M7.2 2.2 8 5.1", key: "1cfko1" }],
  [
    "path",
    {
      d: "M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z",
      key: "s0h3yz"
    }
  ]
];
var MousePointerClick = createLucideIcon("MousePointerClick", __iconNode18);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/pen-line.js
var __iconNode19 = [
  ["path", { d: "M12 20h9", key: "t2du7b" }],
  [
    "path",
    {
      d: "M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z",
      key: "1ykcvy"
    }
  ]
];
var PenLine = createLucideIcon("PenLine", __iconNode19);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/pin.js
var __iconNode20 = [
  ["path", { d: "M12 17v5", key: "bb1du9" }],
  [
    "path",
    {
      d: "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
      key: "1nkz8b"
    }
  ]
];
var Pin = createLucideIcon("Pin", __iconNode20);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/redo-2.js
var __iconNode21 = [
  ["path", { d: "m15 14 5-5-5-5", key: "12vg1m" }],
  ["path", { d: "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13", key: "6uklza" }]
];
var Redo2 = createLucideIcon("Redo2", __iconNode21);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/scissors.js
var __iconNode22 = [
  ["circle", { cx: "6", cy: "6", r: "3", key: "1lh9wr" }],
  ["path", { d: "M8.12 8.12 12 12", key: "1alkpv" }],
  ["path", { d: "M20 4 8.12 15.88", key: "xgtan2" }],
  ["circle", { cx: "6", cy: "18", r: "3", key: "fqmcym" }],
  ["path", { d: "M14.8 14.8 20 20", key: "ptml3r" }]
];
var Scissors = createLucideIcon("Scissors", __iconNode22);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/scroll-text.js
var __iconNode23 = [
  ["path", { d: "M15 12h-5", key: "r7krc0" }],
  ["path", { d: "M15 8h-5", key: "1khuty" }],
  ["path", { d: "M19 17V5a2 2 0 0 0-2-2H4", key: "zz82l3" }],
  [
    "path",
    {
      d: "M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3",
      key: "1ph1d7"
    }
  ]
];
var ScrollText = createLucideIcon("ScrollText", __iconNode23);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/search.js
var __iconNode24 = [
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }],
  ["path", { d: "m21 21-4.3-4.3", key: "1qie3q" }]
];
var Search = createLucideIcon("Search", __iconNode24);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/shield-check.js
var __iconNode25 = [
  [
    "path",
    {
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      key: "oel41y"
    }
  ],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
];
var ShieldCheck = createLucideIcon("ShieldCheck", __iconNode25);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/sparkles.js
var __iconNode26 = [
  [
    "path",
    {
      d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
      key: "4pj2yx"
    }
  ],
  ["path", { d: "M20 3v4", key: "1olli1" }],
  ["path", { d: "M22 5h-4", key: "1gvqau" }],
  ["path", { d: "M4 17v2", key: "vumght" }],
  ["path", { d: "M5 18H3", key: "zchphs" }]
];
var Sparkles = createLucideIcon("Sparkles", __iconNode26);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/square.js
var __iconNode27 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }]
];
var Square = createLucideIcon("Square", __iconNode27);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/sun-dim.js
var __iconNode28 = [
  ["circle", { cx: "12", cy: "12", r: "4", key: "4exip2" }],
  ["path", { d: "M12 4h.01", key: "1ujb9j" }],
  ["path", { d: "M20 12h.01", key: "1ykeid" }],
  ["path", { d: "M12 20h.01", key: "zekei9" }],
  ["path", { d: "M4 12h.01", key: "158zrr" }],
  ["path", { d: "M17.657 6.343h.01", key: "31pqzk" }],
  ["path", { d: "M17.657 17.657h.01", key: "jehnf4" }],
  ["path", { d: "M6.343 17.657h.01", key: "gdk6ow" }],
  ["path", { d: "M6.343 6.343h.01", key: "1uurf0" }]
];
var SunDim = createLucideIcon("SunDim", __iconNode28);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/trash-2.js
var __iconNode29 = [
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", key: "4alrt4" }],
  ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2", key: "v07s0e" }],
  ["line", { x1: "10", x2: "10", y1: "11", y2: "17", key: "1uufr5" }],
  ["line", { x1: "14", x2: "14", y1: "11", y2: "17", key: "xtxkd" }]
];
var Trash2 = createLucideIcon("Trash2", __iconNode29);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/type.js
var __iconNode30 = [
  ["polyline", { points: "4 7 4 4 20 4 20 7", key: "1nosan" }],
  ["line", { x1: "9", x2: "15", y1: "20", y2: "20", key: "swin9y" }],
  ["line", { x1: "12", x2: "12", y1: "4", y2: "20", key: "1tx1rr" }]
];
var Type = createLucideIcon("Type", __iconNode30);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/undo-2.js
var __iconNode31 = [
  ["path", { d: "M9 14 4 9l5-5", key: "102s5s" }],
  ["path", { d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11", key: "f3b9sd" }]
];
var Undo2 = createLucideIcon("Undo2", __iconNode31);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/video.js
var __iconNode32 = [
  [
    "path",
    {
      d: "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5",
      key: "ftymec"
    }
  ],
  ["rect", { x: "2", y: "6", width: "14", height: "12", rx: "2", key: "158x01" }]
];
var Video = createLucideIcon("Video", __iconNode32);

// ../parity/proj/node_modules/lucide-react/dist/esm/icons/x.js
var __iconNode33 = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
];
var X = createLucideIcon("X", __iconNode33);

// src/snip/api.ts
var EVT = {
  begin: "lens://snip/begin",
  studio: "lens://snip/studio",
  record: "lens://snip/record",
  scroll: "lens://snip/scroll",
  history: "lens://snip/history",
  error: "lens://snip/error"
};
var DEFAULT_SNIP_SETTINGS = {
  enabled: false,
  hotkey: "Ctrl+Shift+S",
  printScreen: false,
  defaultMode: "region",
  delaySeconds: 0,
  includeCursor: false,
  afterCapture: "studio",
  saveDir: "",
  filenameTemplate: "Lens Snip {date} at {time}",
  autoRedact: true,
  ocrLanguage: "auto",
  beautify: "none",
  pinOpacity: 1,
  pinClickThrough: false,
  recordFps: 30,
  recordFormat: "mp4",
  recordQuality: "balanced",
  recordMic: "",
  recordClickHighlight: true,
  historyEnabled: true,
  historyDays: 30,
  historyMax: 500,
  historyMaxMb: 1024,
  showRecent: true
};
var snipStatus = () => invoke2("snip_status");
var snipSetSettings = (settings2) => invoke2("snip_set_settings", { settings: settings2 });
var snipStart = (mode, delay) => invoke2("snip_start", { mode: mode ?? null, delay: delay ?? null });
var snipElements = (hwnd, x, y) => invoke2("snip_elements", { hwnd, x, y });
var snipExport = (req) => invoke2("snip_export", { req: { ocrText: null, title: null, tags: null, ...req } });
var snipToClaude = (req) => invoke2("snip_to_claude", { req: { ocrText: null, prompt: null, ...req } });
var snipShare = (id, png) => invoke2("snip_share", { id, png });
var snipRecent = () => invoke2("snip_recent");
var snipRecentClear = () => invoke2("snip_recent_clear");
var snipRunningApps = () => invoke2("snip_running_apps");
var snipOpenIn = (id, png, exe) => invoke2("snip_open_in", { req: { id, png, exe } });
var snipPinInfo = (label) => invoke2("snip_pin_info", { label });
var snipPinClickThrough = (label, on2) => invoke2("snip_pin_click_through", { label, on: on2 });
var snipPinClose = (label) => invoke2("snip_pin_close", { label });
var snipPinsRelease = () => invoke2("snip_pins_release");
var snipHistory = (query) => invoke2("snip_history", { query: query ?? null });
var snipHistoryOpen = (id) => invoke2("snip_history_open", { id });
var snipHistoryDelete = (id) => invoke2("snip_history_delete", { id });
var snipHistoryPin = (id, pinned) => invoke2("snip_history_pin", { id, pinned });
var snipHistoryClear = () => invoke2("snip_history_clear");
var snipRecordStop = () => invoke2("snip_record_stop");
var snipRecordState = () => invoke2("snip_record_state");
var snipRecordTrim = (path, start, end) => invoke2("snip_record_trim", { path, start, end });
var snipRecordMics = () => invoke2("snip_record_mics");
function on(event, handler) {
  return listen(event, (e) => handler(e.payload));
}

// src/snip/geom.ts
var right = (r) => r.x + r.w;
var bottom = (r) => r.y + r.h;
var area = (r) => r.w <= 0 || r.h <= 0 ? 0 : r.w * r.h;
var contains = (r, x, y) => x >= r.x && y >= r.y && x < right(r) && y < bottom(r);
function normalize(ax, ay, bx, by) {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(ax - bx) + 1, h: Math.abs(ay - by) + 1 };
}
function physicalToCss(r, origin, dpr) {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return { x: (r.x - origin.x) / d, y: (r.y - origin.y) / d, w: r.w / d, h: r.h / d };
}
function snapTarget(candidates, px, py, minSize = 4) {
  let best = null;
  for (const c of candidates) {
    if (c.w < minSize || c.h < minSize || !contains(c, px, py)) continue;
    if (!best || area(c) < area(best)) best = c;
  }
  return best;
}
function snapEdges(r, candidates, threshold) {
  const snap1 = (v, edges) => {
    let best = v;
    let dist = threshold + 1;
    for (const e of edges) {
      const d = Math.abs(e - v);
      if (d < dist) {
        dist = d;
        best = e;
      }
    }
    return best;
  };
  const xs = candidates.flatMap((c) => [c.x, right(c)]);
  const ys = candidates.flatMap((c) => [c.y, bottom(c)]);
  const l = snap1(r.x, xs);
  const t = snap1(r.y, ys);
  const rr2 = snap1(right(r), xs);
  const b = snap1(bottom(r), ys);
  if (rr2 <= l || b <= t) return r;
  return { x: l, y: t, w: rr2 - l, h: b - t };
}
function boundsOf(points) {
  if (points.length < 3) return null;
  const xs = points.map((p2) => p2.x);
  const ys = points.map((p2) => p2.y);
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  return { x, y, w: Math.ceil(Math.max(...xs)) - x + 1, h: Math.ceil(Math.max(...ys)) - y + 1 };
}

// src/snip/Tip.tsx
var import_react5 = __toESM(require_react(), 1);
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
var Tip = ({ text, below, children }) => {
  const [open, setOpen] = (0, import_react5.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "span",
    {
      className: "snip-tip-wrap",
      onMouseEnter: () => setOpen(true),
      onMouseLeave: () => setOpen(false),
      onFocus: () => setOpen(true),
      onBlur: () => setOpen(false),
      children: [
        children,
        open && text ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "tooltip", className: `snip-tip ${below ? "below" : ""}`, children: text }) : null
      ]
    }
  );
};

// src/snip/Select.tsx
var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
var MODES = [
  { id: "region", label: "Region", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Crop, { size: 15 }), hint: "Drag an area, or click to take what's under the pointer" },
  { id: "window", label: "Window", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AppWindow, { size: 15 }), hint: "Click a window \u2014 captured on its own, even if covered" },
  { id: "monitor", label: "Screen", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Monitor, { size: 15 }), hint: "Click a screen" },
  { id: "all", label: "All screens", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Camera, { size: 15 }), hint: "Every screen in one image" },
  { id: "freeform", label: "Freeform", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Lasso, { size: 15 }), hint: "Draw around anything" },
  { id: "scroll", label: "Scrolling", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ScrollText, { size: 15 }), hint: "Experimental: click a window and Lens scrolls it for you" },
  { id: "record", label: "Record", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Video, { size: 15 }), hint: "Drag an area to record it as a video" }
];
var DELAYS = [0, 3, 5, 10];
var Select = ({ session, initialMode, delay, onDelay, cursor, onCursor, onDone, onCancel, demo }) => {
  const [mode, setMode] = (0, import_react6.useState)(initialMode);
  const [drag, setDrag] = (0, import_react6.useState)(null);
  const [fixed, setFixed] = (0, import_react6.useState)(demo?.rect ?? null);
  const [lasso, setLasso] = (0, import_react6.useState)([]);
  const [pointer, setPointer] = (0, import_react6.useState)(demo?.pointer ?? null);
  const [elements, setElements] = (0, import_react6.useState)([]);
  const [frameImg, setFrameImg] = (0, import_react6.useState)(null);
  const loupeRef = (0, import_react6.useRef)(null);
  const dwell = (0, import_react6.useRef)(void 0);
  const origin = { x: session.origin.x, y: session.origin.y };
  const dpr = window.devicePixelRatio || 1;
  const toPhys = (0, import_react6.useCallback)((cx, cy) => ({ x: Math.round(origin.x + cx * dpr), y: Math.round(origin.y + cy * dpr) }), [origin.x, origin.y, dpr]);
  (0, import_react6.useEffect)(() => {
    const img = new Image();
    img.onload = () => setFrameImg(img);
    img.src = session.frame;
  }, [session.frame]);
  const windowAt = (0, import_react6.useCallback)((p2) => session.windows.find((w) => contains(w.rect, p2.x, p2.y)) ?? null, [session.windows]);
  (0, import_react6.useEffect)(() => {
    if (!pointer || drag || mode !== "region") return;
    window.clearTimeout(dwell.current);
    const w = windowAt(pointer);
    if (!w) {
      setElements([]);
      return;
    }
    dwell.current = window.setTimeout(() => {
      snipElements(w.hwnd, pointer.x, pointer.y).then(setElements).catch(() => setElements([]));
    }, 220);
    return () => window.clearTimeout(dwell.current);
  }, [pointer, drag, mode, windowAt]);
  const hoverTarget = (0, import_react6.useMemo)(() => {
    if (!pointer || drag || fixed) return null;
    if (mode === "monitor") return session.monitors.find((m) => contains(m.rect, pointer.x, pointer.y))?.rect ?? null;
    if (mode === "window" || mode === "scroll") return windowAt(pointer)?.rect ?? null;
    if (mode === "region") {
      const w = windowAt(pointer);
      const cands = [...w ? [w.rect] : [], ...elements];
      return snapTarget(cands, pointer.x, pointer.y, 8);
    }
    return null;
  }, [pointer, drag, fixed, mode, session.monitors, windowAt, elements]);
  const snapCands = (0, import_react6.useMemo)(() => [...session.windows.map((w) => w.rect), ...elements, ...session.monitors.map((m) => m.rect)], [session.windows, session.monitors, elements]);
  const selection = drag ? snapEdges(normalize(drag.ax, drag.ay, drag.bx, drag.by), snapCands, Math.round(6 * dpr)) : fixed ?? hoverTarget;
  (0, import_react6.useEffect)(() => {
    const c = loupeRef.current;
    if (!c || !frameImg || !pointer) return;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 128, 128);
    const sx = pointer.x - origin.x - 8;
    const sy = pointer.y - origin.y - 8;
    ctx.drawImage(frameImg, sx, sy, 16, 16, 0, 0, 128, 128);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    for (let i = 8; i < 128; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i + 0.5, 0);
      ctx.lineTo(i + 0.5, 128);
      ctx.moveTo(0, i + 0.5);
      ctx.lineTo(128, i + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(64.5, 64.5, 8, 8);
  }, [pointer, frameImg, origin.x, origin.y]);
  const colour = (0, import_react6.useMemo)(() => {
    if (!frameImg || !pointer) return "#000000";
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d");
    ctx.drawImage(frameImg, pointer.x - origin.x, pointer.y - origin.y, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }, [frameImg, pointer, origin.x, origin.y]);
  const finish = (0, import_react6.useCallback)(
    (sel) => {
      onDone(sel, mode);
    },
    [onDone, mode]
  );
  const onDown = (e) => {
    if (e.button !== 0) return;
    const p2 = toPhys(e.clientX, e.clientY);
    e.target.setPointerCapture?.(e.pointerId);
    setFixed(null);
    if (mode === "freeform") {
      setLasso([p2]);
      return;
    }
    if (mode === "region" || mode === "record") setDrag({ ax: p2.x, ay: p2.y, bx: p2.x, by: p2.y });
  };
  const onMove = (e) => {
    const p2 = toPhys(e.clientX, e.clientY);
    setPointer(p2);
    if (mode === "freeform" && lasso.length) setLasso((l) => [...l, p2]);
    else if (drag) setDrag((d) => d ? { ...d, bx: p2.x, by: p2.y } : d);
  };
  const onUp = (e) => {
    const p2 = toPhys(e.clientX, e.clientY);
    if (mode === "freeform") {
      const b = boundsOf(lasso);
      setLasso([]);
      if (b && b.w > 4 && b.h > 4) finish({ kind: "freeform", rect: b, points: lasso });
      return;
    }
    if (drag) {
      const r = snapEdges(normalize(drag.ax, drag.ay, p2.x, p2.y), snapCands, Math.round(6 * dpr));
      setDrag(null);
      if (r.w <= 3 && r.h <= 3) {
        if (hoverTarget) finish({ kind: "region", rect: hoverTarget });
        return;
      }
      if (mode === "record") setFixed(r);
      else finish({ kind: "region", rect: r });
      return;
    }
    if (mode === "window" || mode === "scroll") {
      const w = windowAt(p2);
      if (w) finish({ kind: "window", rect: w.rect, hwnd: w.hwnd });
    } else if (mode === "monitor") {
      const m = session.monitors.find((m2) => contains(m2.rect, p2.x, p2.y));
      if (m) finish({ kind: "monitor", rect: m.rect });
    }
  };
  (0, import_react6.useEffect)(() => {
    const onKey2 = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (fixed || drag) {
          setFixed(null);
          setDrag(null);
        } else onCancel();
        return;
      }
      if (e.key === "Enter" && selection) {
        e.preventDefault();
        finish({ kind: "region", rect: selection });
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const i = MODES.findIndex((m) => m.id === mode);
        const next = MODES[(i + (e.shiftKey ? MODES.length - 1 : 1)) % MODES.length].id;
        pick(next);
        return;
      }
      if (fixed && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0];
        setFixed((f) => f ? e.altKey ? { ...f, w: Math.max(4, f.w + d[0]), h: Math.max(4, f.h + d[1]) } : { ...f, x: f.x + d[0], y: f.y + d[1] } : f);
      }
    };
    window.addEventListener("keydown", onKey2);
    return () => window.removeEventListener("keydown", onKey2);
  });
  const pick = (m) => {
    setMode(m);
    setFixed(null);
    setDrag(null);
    if (m === "all") finish({ kind: "all", rect: session.origin });
  };
  const css = selection ? physicalToCss(selection, origin, dpr) : null;
  const vw = session.origin.w / dpr;
  const vh = session.origin.h / dpr;
  const lassoCss = lasso.map((p2) => `${(p2.x - origin.x) / dpr},${(p2.y - origin.y) / dpr}`).join(" ");
  const pCss = pointer ? physicalToCss({ x: pointer.x, y: pointer.y, w: 0, h: 0 }, origin, dpr) : null;
  const loupeLeft = pCss ? pCss.x + 152 > vw ? pCss.x - 152 : pCss.x + 24 : 0;
  const loupeTop = pCss ? pCss.y + 176 > vh ? pCss.y - 176 : pCss.y + 24 : 0;
  const label = selection ? `${selection.w} \xD7 ${selection.h}` : "";
  const scale = selection ? session.monitors.find((m) => contains(m.rect, selection.x + 1, selection.y + 1))?.scale ?? 1 : 1;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "snip-root", "aria-label": "Lens Snip \u2014 choose what to capture", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { className: "snip-frame", src: session.frame, alt: "", draggable: false }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { className: "snip-dim", width: "100%", height: "100%", viewBox: `0 0 ${vw} ${vh}`, preserveAspectRatio: "none", "aria-hidden": true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("mask", { id: "snip-cut", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "0", y: "0", width: vw, height: vh, fill: "#fff" }),
        css ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: css.x, y: css.y, width: css.w, height: css.h, fill: "#000" }) : null,
        lassoCss ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("polygon", { points: lassoCss, fill: "#000" }) : null
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "0", y: "0", width: vw, height: vh, fill: "rgba(0,0,0,0.45)", mask: "url(#snip-cut)" }),
      lassoCss ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("polyline", { points: lassoCss, fill: "none", stroke: "var(--lens-accent)", strokeWidth: 1.5 }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "div",
      {
        className: `snip-select mode-${mode}`,
        onPointerDown: onDown,
        onPointerMove: onMove,
        onPointerUp: onUp,
        onPointerLeave: () => setPointer(null),
        role: "application",
        "aria-roledescription": "screen selection"
      }
    ),
    css ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `snip-sel-box ${!drag && !fixed ? "snapped" : ""}`, style: { left: css.x, top: css.y, width: css.w, height: css.h }, children: fixed ? [[-4, -4], [css.w - 4, -4], [-4, css.h - 4], [css.w - 4, css.h - 4]].map(([l, t], i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "snip-handle", style: { left: l, top: t } }, i)) : null }) : null,
    css ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "snip-size", style: { left: css.x, top: css.y > 28 ? css.y - 28 : css.y + css.h + 8 }, children: [
      label,
      scale !== 1 ? ` \xB7 ${Math.round(scale * 100)}%` : ""
    ] }) : null,
    pCss && mode !== "all" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "snip-loupe", style: { left: loupeLeft, top: loupeTop }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("canvas", { ref: loupeRef, width: 128, height: 128 }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "snip-loupe-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "snip-swatch", style: { background: colour } }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: colour }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { marginLeft: "auto" }, children: [
          pointer.x,
          ",",
          pointer.y
        ] })
      ] })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "snip-modebar", role: "toolbar", "aria-label": "Capture mode", onPointerDown: (e) => e.stopPropagation(), children: [
      MODES.map((m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Tip, { text: m.hint, below: true, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: `snip-btn ${mode === m.id ? "on" : ""}`, "aria-pressed": mode === m.id, onClick: () => pick(m.id), children: [
        m.icon,
        m.label
      ] }) }, m.id)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sep" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Tip, { text: delay ? `Captures ${delay} s after you start` : "Capture right away", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "snip-btn", onClick: () => onDelay(DELAYS[(DELAYS.indexOf(delay) + 1) % DELAYS.length]), "aria-label": `Delay ${delay} seconds`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Clock, { size: 15 }),
        delay ? `${delay}s` : "Now"
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Tip, { text: cursor ? "The pointer is included" : "The pointer is left out", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: `snip-btn icon ${cursor ? "on" : ""}`, "aria-pressed": cursor, "aria-label": "Include pointer", onClick: () => onCursor(!cursor), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MousePointer2, { size: 15 }) }) }),
      mode === "record" && fixed ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "snip-btn primary", onClick: () => finish({ kind: "region", rect: fixed }), children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Video, { size: 15 }),
        " Start recording"
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sep" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Tip, { text: "Cancel (Esc)", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "snip-btn icon", "aria-label": "Cancel", onClick: onCancel, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(X, { size: 15 }) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "snip-hint", children: mode === "record" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      "Drag the area to record \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("kbd", { children: "Esc" }),
      " cancel"
    ] }) : mode === "freeform" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      "Draw around what you want \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("kbd", { children: "Esc" }),
      " cancel"
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      "Drag or click \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("kbd", { children: "Enter" }),
      " take \xB7 arrows nudge \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("kbd", { children: "Tab" }),
      " mode \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("kbd", { children: "Esc" }),
      " cancel"
    ] }) })
  ] });
};

// src/snip/Studio.tsx
var import_react8 = __toESM(require_react(), 1);

// src/snip/actions.ts
var ACTIONS = [
  { id: "copy", key: "1", label: "Copy", hint: "Copy the image (Ctrl+C)" },
  { id: "copyText", key: "2", label: "Copy text", hint: "Copy the text Windows OCR found" },
  { id: "save", key: "3", label: "Save", hint: "Save a PNG to your snips folder (Ctrl+S)" },
  { id: "pin", key: "4", label: "Pin", hint: "Float it on top of your windows" },
  { id: "shelf", key: "5", label: "Shelf", hint: "Add the image and its text to your Shelf" },
  { id: "claude", key: "6", label: "Paste to Claude", hint: "Claude Desktop (you press Ctrl+V) or Lens Command" },
  { id: "ask", key: "7", label: "Ask", hint: "Ask a question about this snip in Lens Command" },
  { id: "translate", key: "8", label: "Translate", hint: "Translate the text in place" },
  { id: "share", key: "9", label: "Share", hint: "Open the Windows share sheet \u2014 you choose where it goes" },
  { id: "openIn", key: "0", label: "Send to\u2026", hint: "Copy it and bring an app forward. You press Send yourself." }
];
function disabledReason(id, a) {
  if (id === "copyText" || id === "translate") {
    if (!a.ocrReady) return "Reading text\u2026";
    if (!a.hasText) return "No text found in this snip";
  }
  if (id === "translate" && !a.aiOn) return "Turn on Lens Intelligence to translate";
  return null;
}
function onKey(state, key2, mods, a) {
  const n = ACTIONS.length;
  const can = (id) => disabledReason(id, a) === null;
  if (mods.ctrl) {
    const k = key2.toLowerCase();
    if (k === "c" && !mods.shift) return { state, run: "copy" };
    if (k === "c" && mods.shift && can("copyText")) return { state, run: "copyText" };
    if (k === "s") return { state, run: "save" };
    return { state };
  }
  if (key2 === "Escape") return { state, close: true };
  const byKey = ACTIONS.find((x) => x.key === key2);
  if (byKey) return can(byKey.id) ? { state: { focus: ACTIONS.indexOf(byKey) }, run: byKey.id } : { state };
  if (key2 === "ArrowRight" || key2 === "ArrowLeft") {
    const dir = key2 === "ArrowRight" ? 1 : -1;
    let f = state.focus;
    for (let i = 0; i < n; i++) {
      f = (f + dir + n) % n;
      if (can(ACTIONS[f].id)) break;
    }
    return { state: { focus: f } };
  }
  if (key2 === "Home") return { state: { focus: 0 } };
  if (key2 === "End") return { state: { focus: n - 1 } };
  if (key2 === "Enter") {
    const id = ACTIONS[state.focus]?.id;
    return id && can(id) ? { state, run: id } : { state };
  }
  return { state };
}
function initialFocus(after) {
  const map = { copy: "copy", save: "save", pin: "pin", shelf: "shelf" };
  const id = map[after];
  return id ? ACTIONS.findIndex((x) => x.id === id) : 0;
}

// src/snip/annotations.ts
var MAX_UNDO = 100;
var seq = 0;
var newId = (p2 = "s") => `${p2}${Date.now().toString(36)}${(seq++).toString(36)}`;
var empty = () => ({ doc: { shapes: [], crop: null }, past: [], future: [] });
function renumber(shapes) {
  let n = 0;
  return shapes.map((s) => s.kind === "step" ? { ...s, n: ++n } : s);
}
function nextStep(doc) {
  return doc.shapes.filter((s) => s.kind === "step").length + 1;
}
function commit(h, doc) {
  return { doc, past: [...h.past, h.doc].slice(-MAX_UNDO), future: [] };
}
function reduce(h, a) {
  switch (a.type) {
    case "add":
      return commit(h, { ...h.doc, shapes: renumber([...h.doc.shapes, a.shape]) });
    case "update": {
      if (!h.doc.shapes.some((s) => s.id === a.id)) return h;
      const shapes = h.doc.shapes.map((s) => s.id === a.id ? { ...s, ...a.patch, id: s.id, kind: s.kind } : s);
      return commit(h, { ...h.doc, shapes });
    }
    case "remove": {
      if (!h.doc.shapes.some((s) => s.id === a.id)) return h;
      return commit(h, { ...h.doc, shapes: renumber(h.doc.shapes.filter((s) => s.id !== a.id)) });
    }
    case "crop":
      return commit(h, { ...h.doc, crop: a.rect && a.rect.w > 2 && a.rect.h > 2 ? a.rect : null });
    case "redact": {
      const have = new Set(h.doc.shapes.filter((s) => s.kind === "pixelate" || s.kind === "blur").map((s) => key(s.rect)));
      const add = a.rects.filter((r) => !have.has(key(r.rect))).map((r) => ({ id: newId("r"), kind: a.style ?? "pixelate", rect: r.rect, color: "#000", source: "auto", label: r.label }));
      if (!add.length) return h;
      return commit(h, { ...h.doc, shapes: [...h.doc.shapes, ...add] });
    }
    case "clear":
      return h.doc.shapes.length || h.doc.crop ? commit(h, { shapes: [], crop: null }) : h;
    case "undo": {
      const prev = h.past[h.past.length - 1];
      return prev ? { doc: prev, past: h.past.slice(0, -1), future: [h.doc, ...h.future] } : h;
    }
    case "redo": {
      const next = h.future[0];
      return next ? { doc: next, past: [...h.past, h.doc], future: h.future.slice(1) } : h;
    }
  }
}
var key = (r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`;
function isRedacted(doc, r) {
  return doc.shapes.some((s) => (s.kind === "pixelate" || s.kind === "blur") && key(s.rect) === key(r));
}
var redactionCount = (doc) => doc.shapes.filter((s) => s.kind === "pixelate" || s.kind === "blur").length;
var TOOL_KEYS = {
  v: "select",
  a: "arrow",
  r: "box",
  h: "highlight",
  t: "text",
  n: "step",
  p: "pixelate",
  b: "blur",
  s: "spotlight",
  d: "pen",
  c: "crop"
};

// src/snip/render.ts
var BEAUTIFY = {
  soft: { from: "#e0e7ff", to: "#fce7f3", pad: 56, radius: 12, shadow: 32 },
  vivid: { from: "#6366f1", to: "#ec4899", pad: 64, radius: 14, shadow: 40 },
  mono: { from: "#18181b", to: "#3f3f46", pad: 48, radius: 10, shadow: 28 }
};
function drawShape(ctx, s, src) {
  ctx.save();
  switch (s.kind) {
    case "arrow": {
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = Math.max(10, s.width * 4);
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2 - Math.cos(ang) * head * 0.6, s.y2 - Math.sin(ang) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(ang - 0.45), s.y2 - head * Math.sin(ang - 0.45));
      ctx.lineTo(s.x2 - head * Math.cos(ang + 0.45), s.y2 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "box":
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineJoin = "round";
      roundRect(ctx, s.rect.x, s.rect.y, s.rect.w, s.rect.h, 4);
      ctx.stroke();
      break;
    case "highlight":
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(s.rect.x, s.rect.y, s.rect.w, s.rect.h);
      break;
    case "text": {
      ctx.font = `600 ${s.size}px "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.lineWidth = Math.max(3, s.size / 6);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineJoin = "round";
      ctx.strokeText(s.text, s.x, s.y);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
      break;
    }
    case "step": {
      const r = 14;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `700 15px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(s.n), s.x, s.y + 1);
      break;
    }
    case "pixelate": {
      const { x, y, w, h } = clampRect(s.rect, ctx.canvas.width, ctx.canvas.height);
      if (w < 1 || h < 1) break;
      const block = Math.max(6, Math.round(Math.min(w, h) / 6));
      const sw = Math.max(1, Math.round(w / block));
      const sh = Math.max(1, Math.round(h / block));
      const tmp = document.createElement("canvas");
      tmp.width = sw;
      tmp.height = sh;
      const t = tmp.getContext("2d");
      t.imageSmoothingEnabled = true;
      t.drawImage(ctx.canvas, x, y, w, h, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, sw, sh, x, y, w, h);
      break;
    }
    case "blur": {
      const { x, y, w, h } = clampRect(s.rect, ctx.canvas.width, ctx.canvas.height);
      if (w < 1 || h < 1) break;
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const t = tmp.getContext("2d");
      t.filter = `blur(${Math.max(6, Math.round(Math.min(w, h) / 4))}px)`;
      t.drawImage(ctx.canvas, x - 12, y - 12, w + 24, h + 24, -12, -12, w + 24, h + 24);
      ctx.drawImage(tmp, x, y);
      break;
    }
    case "spotlight": {
      const { width: W2, height: H } = ctx.canvas;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.rect(0, 0, W2, H);
      roundRect(ctx, s.rect.x, s.rect.y, s.rect.w, s.rect.h, 8);
      ctx.fill("evenodd");
      break;
    }
    case "pen": {
      if (s.points.length < 4) break;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.points[0], s.points[1]);
      for (let i = 2; i < s.points.length; i += 2) ctx.lineTo(s.points[i], s.points[i + 1]);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
  void src;
}
function clampRect(r, W2, H) {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  return { x, y, w: Math.min(W2, Math.ceil(r.x + r.w)) - x, h: Math.min(H, Math.ceil(r.y + r.h)) - y };
}
function roundRect(ctx, x, y, w, h, r) {
  const rr2 = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr2, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr2);
  ctx.arcTo(x + w, y + h, x, y + h, rr2);
  ctx.arcTo(x, y + h, x, y, rr2);
  ctx.arcTo(x, y, x + w, y, rr2);
  ctx.closePath();
}
function renderDoc(img, doc, opts = {}) {
  const base2 = document.createElement("canvas");
  base2.width = img.width;
  base2.height = img.height;
  const ctx = base2.getContext("2d");
  ctx.drawImage(img, 0, 0);
  if (opts.mask && opts.mask.length > 2) {
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    opts.mask.forEach((p2, i) => i ? ctx.lineTo(p2.x, p2.y) : ctx.moveTo(p2.x, p2.y));
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  for (const s of doc.shapes) if (s.kind === "pixelate" || s.kind === "blur") drawShape(ctx, s, img);
  for (const line of opts.translation ?? []) drawTranslation(ctx, line, opts.translationBg ?? sampleBackground(ctx, line.rect));
  for (const s of doc.shapes) if (s.kind !== "pixelate" && s.kind !== "blur") drawShape(ctx, s, img);
  let out = base2;
  if (doc.crop) {
    const c = clampRect(doc.crop, base2.width, base2.height);
    if (c.w > 0 && c.h > 0) {
      out = document.createElement("canvas");
      out.width = c.w;
      out.height = c.h;
      out.getContext("2d").drawImage(base2, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
    }
  }
  return opts.beautify && opts.beautify.preset !== "none" ? beautify(out, opts.beautify) : out;
}
function drawTranslation(ctx, line, bg) {
  const { x, y, w, h } = line.rect;
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  let size = Math.max(9, Math.round(h * 0.85));
  ctx.font = `500 ${size}px "Segoe UI", system-ui, sans-serif`;
  while (size > 8 && ctx.measureText(line.text).width > w + 8) {
    size -= 1;
    ctx.font = `500 ${size}px "Segoe UI", system-ui, sans-serif`;
  }
  ctx.fillStyle = luminance(bg) > 0.5 ? "#111" : "#f5f5f5";
  ctx.textBaseline = "middle";
  ctx.fillText(line.text, x, y + h / 2);
  ctx.restore();
}
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255;
}
function beautify(src, b) {
  const p2 = b.preset === "theme" ? { from: b.surface, to: b.accent, pad: 56, radius: 12, shadow: 32 } : BEAUTIFY[b.preset] ?? BEAUTIFY.soft;
  const out = document.createElement("canvas");
  out.width = src.width + p2.pad * 2;
  out.height = src.height + p2.pad * 2;
  const ctx = out.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, out.width, out.height);
  g.addColorStop(0, p2.from);
  g.addColorStop(1, p2.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = p2.shadow;
  ctx.shadowOffsetY = p2.shadow / 3;
  ctx.beginPath();
  roundRect(ctx, p2.pad, p2.pad, src.width, src.height, p2.radius);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, p2.pad, p2.pad, src.width, src.height, p2.radius);
  ctx.clip();
  ctx.drawImage(src, p2.pad, p2.pad);
  ctx.restore();
  return out;
}
function sampleBackground(ctx, r) {
  const x = Math.max(0, Math.floor(r.x) - 2);
  const y = Math.max(0, Math.floor(r.y) - 2);
  const w = Math.min(ctx.canvas.width - x, Math.ceil(r.w) + 4);
  const h = Math.min(ctx.canvas.height - y, Math.ceil(r.h) + 4);
  if (w <= 0 || h <= 0) return "#ffffff";
  const d = ctx.getImageData(x, y, w, h).data;
  let rr2 = 0, gg = 0, bb = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const px = i / 4 % w;
    const py = Math.floor(i / 4 / w);
    if (px > 1 && px < w - 2 && py > 1 && py < h - 2) continue;
    rr2 += d[i];
    gg += d[i + 1];
    bb += d[i + 2];
    n++;
  }
  if (!n) return "#ffffff";
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(rr2)}${hex(gg)}${hex(bb)}`;
}

// src/ai/client.ts
var import_react7 = __toESM(require_react(), 1);

// src/ai/contract.ts
var AI_EVENTS = {
  delta: "lens://ai/delta",
  done: "lens://ai/done",
  toolProposal: "lens://ai/tool-proposal",
  toolResult: "lens://ai/tool-result",
  /** Backend → UI: run a UI-layer action ({ tool, args }); see docs/AI.md "Apply bridge". */
  apply: "lens://ai/apply"
};
var INITIAL_RUN = { id: null, status: "idle", text: "", steps: [] };
function reduceAiEvent(s, ev) {
  if (s.id !== null && ev.payload.id !== s.id) return s;
  switch (ev.kind) {
    case "delta":
      return {
        ...s,
        status: s.status === "waiting" || s.status === "idle" ? "running" : s.status,
        text: s.text + ev.payload.text
      };
    case "tool-proposal": {
      const p2 = ev.payload;
      const awaiting = p2.risk === "confirm";
      const step = {
        call_id: p2.call_id,
        tool: p2.tool,
        args: p2.args ?? {},
        summary: p2.summary,
        risk: p2.risk,
        state: awaiting ? "awaiting" : "running"
      };
      const steps = s.steps.some((x) => x.call_id === p2.call_id) ? s.steps.map((x) => x.call_id === p2.call_id ? step : x) : [...s.steps, step];
      return { ...s, steps, status: awaiting ? "waiting" : "running" };
    }
    case "tool-result": {
      const r = ev.payload;
      const steps = s.steps.map(
        (x) => x.call_id === r.call_id ? { ...x, state: r.ok ? "ok" : "failed", message: r.message } : x
      );
      const stillWaiting = steps.some((x) => x.state === "awaiting");
      return { ...s, steps, status: stillWaiting ? "waiting" : "running" };
    }
    case "done": {
      const d = ev.payload;
      const cancelled = d.error === "Cancelled.";
      return {
        ...s,
        status: d.error ? cancelled ? "cancelled" : "error" : "done",
        provider: d.provider,
        model: d.model,
        usage: d.usage,
        error: d.error,
        steps: s.steps.map((x) => x.state === "awaiting" || x.state === "running" ? { ...x, state: "failed" } : x)
      };
    }
  }
}

// src/ai/client.ts
var aiAsk = (req) => invoke2("ai_ask", { req });
var aiCancel = (id) => invoke2("ai_cancel", { id });
var aiConfirmTool = (callId, approve) => invoke2("ai_confirm_tool", { callId, approve });
async function listenAiEvents(handler) {
  const uns = await Promise.all([
    listen(AI_EVENTS.delta, (e) => handler({ kind: "delta", payload: e.payload })),
    listen(AI_EVENTS.done, (e) => handler({ kind: "done", payload: e.payload })),
    listen(AI_EVENTS.toolProposal, (e) => handler({ kind: "tool-proposal", payload: e.payload })),
    listen(AI_EVENTS.toolResult, (e) => handler({ kind: "tool-result", payload: e.payload }))
  ]);
  return () => uns.forEach((u) => u());
}
function useAiRequest() {
  const [state, setState] = (0, import_react7.useState)(INITIAL_RUN);
  const idRef = (0, import_react7.useRef)(null);
  const pendingRef = (0, import_react7.useRef)(false);
  const bufferRef = (0, import_react7.useRef)([]);
  (0, import_react7.useEffect)(() => {
    let alive = true;
    let un = null;
    listenAiEvents((ev) => {
      if (!alive) return;
      if (idRef.current === null) {
        if (pendingRef.current) bufferRef.current.push(ev);
        return;
      }
      if (ev.payload.id !== idRef.current) return;
      setState((s) => reduceAiEvent(s, ev));
    }).then((u) => {
      if (alive) un = u;
      else u();
    });
    return () => {
      alive = false;
      un?.();
    };
  }, []);
  const ask = (0, import_react7.useCallback)(async (req) => {
    if (idRef.current) void aiCancel(idRef.current).catch(() => {
    });
    idRef.current = null;
    bufferRef.current = [];
    pendingRef.current = true;
    setState({ ...INITIAL_RUN, status: "running" });
    try {
      const id = await aiAsk(req);
      idRef.current = id;
      pendingRef.current = false;
      const early = bufferRef.current.filter((e) => e.payload.id === id);
      bufferRef.current = [];
      setState((s) => early.reduce(reduceAiEvent, { ...s, id }));
      return id;
    } catch (e) {
      pendingRef.current = false;
      setState({ ...INITIAL_RUN, status: "error", error: String(e) });
      return null;
    }
  }, []);
  const cancel = (0, import_react7.useCallback)(() => {
    if (idRef.current) void aiCancel(idRef.current).catch(() => {
    });
  }, []);
  const confirm = (0, import_react7.useCallback)(async (callId, approve) => {
    await aiConfirmTool(callId, approve);
  }, []);
  const reset = (0, import_react7.useCallback)(() => {
    if (idRef.current) void aiCancel(idRef.current).catch(() => {
    });
    idRef.current = null;
    bufferRef.current = [];
    pendingRef.current = false;
    setState(INITIAL_RUN);
  }, []);
  return { ...state, ask, cancel, confirm, reset };
}

// src/snip/Studio.tsx
var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
var COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#fafafa", "#09090b"];
var LANGS = ["English", "Spanish", "French", "German", "Portuguese", "Italian", "Japanese", "Korean", "Chinese (Simplified)", "Arabic", "Hindi"];
var TOOLS = [
  { id: "select", icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(MousePointer2, { size: 15 }), label: "Select", key: "V" },
  { id: "arrow", icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ArrowUpRight, { size: 15 }), label: "Arrow", key: "A" },
  { id: "box", icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Square, { size: 15 }), label: "Box", key: "R" },
  { id: "highlight", icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Highlighter, { size: 15 }), label: "Highlight", key: "H" },
  { id: "text", icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Type, { size: 15 }), label: "Text", key: "T" },
  { id: "step", icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ListOrdered, { size: 15 }), label: "Numbered step", key: "N" },
  { id: "pixelate", icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Grid3x3, { size: 15 }), label: "Pixelate", key: "P" },
  { id: "blur", icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Droplets, { size: 15 }), label: "Blur", key: "B" },
  { id: "spotlight", icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SunDim, { size: 15 }), label: "Spotlight", key: "S" },
  { id: "pen", icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(PenLine, { size: 15 }), label: "Pen", key: "D" },
  { id: "crop", icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Crop, { size: 15 }), label: "Crop", key: "C" }
];
var BEAUTIFY2 = [
  { id: "none", label: "Off" },
  { id: "soft", label: "Soft" },
  { id: "vivid", label: "Vivid" },
  { id: "mono", label: "Mono" },
  { id: "theme", label: "Theme" }
];
var Studio = ({ info, settings: settings2, ai, area: area2, analysis, mask, onClose, onNew, demo }) => {
  const [hist, setHist] = (0, import_react8.useState)(demo?.history ?? empty());
  const [tool, setTool] = (0, import_react8.useState)("arrow");
  const [color, setColor] = (0, import_react8.useState)(COLORS[0]);
  const [width, setWidth] = (0, import_react8.useState)(4);
  const [draft, setDraft] = (0, import_react8.useState)(null);
  const [selected, setSelected] = (0, import_react8.useState)(null);
  const [textAt, setTextAt] = (0, import_react8.useState)(null);
  const [beautify2, setBeautify] = (0, import_react8.useState)(settings2.beautify);
  const [popover, setPopover] = (0, import_react8.useState)(demo?.popover ?? null);
  const [toast, setToast] = (0, import_react8.useState)(demo?.toast ?? null);
  const [focus, setFocus] = (0, import_react8.useState)(demo?.focus ?? initialFocus(settings2.afterCapture));
  const [done, setDone] = (0, import_react8.useState)(/* @__PURE__ */ new Set());
  const [recent, setRecent] = (0, import_react8.useState)([]);
  const [apps2, setApps] = (0, import_react8.useState)([]);
  const [askText, setAskText] = (0, import_react8.useState)("");
  const [lang, setLang] = (0, import_react8.useState)("English");
  const [translation, setTranslation] = (0, import_react8.useState)(demo?.translation ?? []);
  const [img, setImg] = (0, import_react8.useState)(null);
  const [preview, setPreview] = (0, import_react8.useState)(info.png);
  const svgRef = (0, import_react8.useRef)(null);
  const run = useAiRequest();
  const doc = hist.doc;
  const ocrReady = analysis !== null;
  const ocrText = analysis?.ocr?.text ?? "";
  const avail = { ocrReady, hasText: ocrText.trim().length > 0, aiOn: !!ai && ai.active !== "off" };
  const provider = ai?.providers.find((p2) => p2.id === ai.active);
  const isLocal = provider ? provider.is_local : true;
  (0, import_react8.useEffect)(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = info.png;
  }, [info.png]);
  (0, import_react8.useEffect)(() => {
    if (!settings2.showRecent) return;
    snipRecent().then(setRecent).catch(() => setRecent([]));
  }, [settings2.showRecent]);
  (0, import_react8.useEffect)(() => {
    if (popover === "openIn") snipRunningApps().then(setApps).catch(() => setApps([]));
  }, [popover]);
  const beautifyOpts = (0, import_react8.useMemo)(() => {
    const cs = getComputedStyle(document.documentElement);
    return { preset: beautify2, accent: cs.getPropertyValue("--lens-accent").trim() || "#6366f1", surface: cs.getPropertyValue("--lens-pack-base").trim() || "#18181b" };
  }, [beautify2]);
  const exportCanvas = (0, import_react8.useCallback)(() => {
    if (!img) return null;
    return renderDoc(img, doc, { beautify: beautifyOpts, mask, translation });
  }, [img, doc, beautifyOpts, mask, translation]);
  (0, import_react8.useEffect)(() => {
    const c = exportCanvas();
    if (c) setPreview(c.toDataURL("image/png"));
  }, [exportCanvas]);
  const png = () => exportCanvas()?.toDataURL("image/png") ?? info.png;
  const flash = (m) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => t === m ? null : t), 3200);
  };
  const markDone = (id) => setDone((d) => new Set(d).add(id));
  const runAction = (0, import_react8.useCallback)(
    async (id) => {
      try {
        switch (id) {
          case "copy":
          case "save":
          case "shelf": {
            const r = await snipExport({ id: info.id, png: png(), action: id, ocrText, title: info.sourceTitle || void 0 });
            markDone(id);
            flash(r.path && id === "save" ? `Saved \u2014 ${r.path}` : r.message);
            break;
          }
          case "pin":
            await snipExport({ id: info.id, png: png(), action: "pin", ocrText });
            onClose();
            break;
          case "copyText":
            await navigator.clipboard.writeText(ocrText);
            markDone(id);
            flash(`Copied ${ocrText.length.toLocaleString()} characters of text`);
            break;
          case "share": {
            const r = await snipShare(info.id, png());
            flash(r.message);
            break;
          }
          default:
            setPopover((p2) => p2 === id ? null : id);
        }
      } catch (e) {
        flash(String(e));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [info.id, ocrText, img, doc, beautify2, translation]
  );
  (0, import_react8.useEffect)(() => {
    const onKeyDown = (e) => {
      const typing = e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA";
      if (e.key === "Escape") {
        e.preventDefault();
        if (textAt) setTextAt(null);
        else if (popover) setPopover(null);
        else onClose();
        return;
      }
      if (typing) return;
      if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        setHist((h) => reduce(h, { type: e.shiftKey ? "redo" : "undo" }));
        return;
      }
      if (e.ctrlKey && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        setHist((h) => reduce(h, { type: "redo" }));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        setHist((h) => reduce(h, { type: "remove", id: selected }));
        setSelected(null);
        return;
      }
      if (!e.ctrlKey && !e.altKey && TOOL_KEYS[e.key.toLowerCase()]) {
        setTool(TOOL_KEYS[e.key.toLowerCase()]);
        return;
      }
      const r = onKey({ focus }, e.key, { ctrl: e.ctrlKey, shift: e.shiftKey }, avail);
      if (r.state.focus !== focus) setFocus(r.state.focus);
      if (r.run) {
        e.preventDefault();
        void runAction(r.run);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  const W2 = info.w;
  const H = info.h;
  const editable = beautify2 === "none";
  const toImg = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W2, y: (e.clientY - r.top) / r.height * H };
  };
  const rectFrom = (a, b) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y)
  });
  const start = (0, import_react8.useRef)(null);
  const onDown = (e) => {
    if (!editable || e.button !== 0) return;
    const p2 = toImg(e);
    e.target.setPointerCapture?.(e.pointerId);
    start.current = p2;
    if (tool === "select") {
      const hit = [...doc.shapes].reverse().find((s) => hitTest(s, p2));
      setSelected(hit?.id ?? null);
      return;
    }
    if (tool === "step") {
      setHist((h) => reduce(h, { type: "add", shape: { id: newId(), kind: "step", x: p2.x, y: p2.y, n: nextStep(h.doc), color } }));
      return;
    }
    if (tool === "text") {
      setTextAt({ x: p2.x, y: p2.y, value: "" });
      return;
    }
    if (tool === "pen") setDraft({ id: newId(), kind: "pen", points: [p2.x, p2.y], color, width });
  };
  const onMove = (e) => {
    const s0 = start.current;
    if (!s0 || !editable) return;
    const p2 = toImg(e);
    const r = rectFrom(s0, p2);
    switch (tool) {
      case "arrow":
        setDraft({ id: "draft", kind: "arrow", x1: s0.x, y1: s0.y, x2: p2.x, y2: p2.y, color, width });
        break;
      case "box":
        setDraft({ id: "draft", kind: "box", rect: r, color, width });
        break;
      case "highlight":
        setDraft({ id: "draft", kind: "highlight", rect: r, color: color === "#09090b" ? "#facc15" : color });
        break;
      case "pixelate":
      case "blur":
        setDraft({ id: "draft", kind: tool, rect: r, color: "#000", source: "user" });
        break;
      case "spotlight":
      case "crop":
        setDraft({ id: "draft", kind: "spotlight", rect: r, color: "#000" });
        break;
      case "pen":
        setDraft((d) => d && d.kind === "pen" ? { ...d, points: [...d.points, p2.x, p2.y] } : d);
        break;
    }
  };
  const onUp = () => {
    start.current = null;
    if (!draft) return;
    const big = draft.kind === "arrow" ? Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 6 : draft.kind === "pen" ? draft.points.length > 4 : "rect" in draft && draft.rect.w > 4 && draft.rect.h > 4;
    if (big) {
      if (tool === "crop" && "rect" in draft) setHist((h) => reduce(h, { type: "crop", rect: draft.rect }));
      else setHist((h) => reduce(h, { type: "add", shape: { ...draft, id: newId() } }));
    }
    setDraft(null);
  };
  const commitText = () => {
    if (textAt && textAt.value.trim()) {
      setHist((h) => reduce(h, { type: "add", shape: { id: newId(), kind: "text", x: textAt.x, y: textAt.y, text: textAt.value.trim(), size: Math.max(16, Math.round(W2 / 48)), color } }));
    }
    setTextAt(null);
  };
  const suggestions = analysis?.suggestions ?? [];
  const toggleSuggestion = (i) => {
    const s = suggestions[i];
    const applied2 = doc.shapes.find((x) => (x.kind === "pixelate" || x.kind === "blur") && isRedacted({ shapes: [x], crop: null }, s.rect));
    setHist((h) => applied2 ? reduce(h, { type: "remove", id: applied2.id }) : reduce(h, { type: "redact", rects: [{ rect: s.rect, label: s.label }] }));
  };
  const acceptAll = () => setHist((h) => reduce(h, { type: "redact", rects: suggestions.filter((s) => s.confidence >= 0.6).map((s) => ({ rect: s.rect, label: s.label })) }));
  const translate = async () => {
    const lines = analysis?.ocr?.lines ?? [];
    if (!lines.length) return;
    const textLines = lines.map((l) => l.words.map((w) => w.text).join(" "));
    await run.ask({
      prompt: `Translate each line into ${lang}. Reply with exactly ${textLines.length} lines, one translation per line, in the same order, and nothing else.`,
      context: { selection: textLines.join("\n"), app_name: info.sourceApp || void 0 },
      allow_tools: false
    });
  };
  (0, import_react8.useEffect)(() => {
    if (run.status !== "done" || !img) return;
    const lines = analysis?.ocr?.lines ?? [];
    const out = run.text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    setTranslation(
      lines.slice(0, out.length).map((l, i) => {
        const rect = l.words.reduce((a, w) => union(a, w.rect), l.words[0].rect);
        return { rect, text: out[i].trim() };
      })
    );
    setPopover(null);
    flash(`Translated ${Math.min(lines.length, out.length)} lines into ${lang}`);
  }, [run.status]);
  const consent = run.steps.find((s) => s.state === "awaiting");
  const panelW = 280;
  const maxStageW = Math.max(320, area2.w - panelW - 48);
  const maxStageH = Math.max(200, area2.h - 48 - 56 - 48);
  const scale = Math.min(1, maxStageW / W2, maxStageH / H);
  const stageCss = { w: Math.round(W2 * scale), h: Math.round(H * scale) };
  const studioW = Math.min(area2.w, Math.max(720, stageCss.w + panelW + 48));
  const studioH = Math.min(area2.h, Math.max(480, stageCss.h + 48 + 56 + 48));
  const left = area2.x + (area2.w - studioW) / 2;
  const top = area2.y + (area2.h - studioH) / 2;
  const red = redactionCount(doc);
  const dragStart = (e) => {
    const url = png();
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("DownloadURL", `image/png:${safeName(info.sourceTitle)}.png:${url}`);
    e.dataTransfer.setData("text/uri-list", url);
  };
  const recentChip = (t) => async () => {
    try {
      const r = t.kind === "claude" ? await snipToClaude({ id: info.id, png: png(), ocrText, target: "desktop" }) : t.kind === "share" ? await snipShare(info.id, png()) : await snipOpenIn(info.id, png(), t.exe ?? "");
      flash(r.message);
    } catch (e) {
      flash(String(e));
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-studio-backdrop", onPointerDown: () => popover && setPopover(null) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "snip-studio", style: { left, top, width: studioW, height: studioH }, role: "dialog", "aria-label": "Lens Snip studio", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "snip-toolbar", role: "toolbar", "aria-label": "Annotate", children: [
        TOOLS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tip, { text: `${t.label} (${t.key})`, below: true, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: `snip-btn icon ${tool === t.id ? "on" : ""}`, "aria-label": t.label, "aria-pressed": tool === t.id, disabled: !editable, onClick: () => setTool(t.id), children: t.icon }) }, t.id)),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sep" }),
        COLORS.map((c) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: `snip-color ${color === c ? "on" : ""}`, style: { background: c }, "aria-label": `Colour ${c}`, onClick: () => setColor(c) }, c)),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sep" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tip, { text: "Line width", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { type: "button", className: "snip-btn", onClick: () => setWidth((w) => w >= 8 ? 2 : w + 2), "aria-label": `Line width ${width}`, children: [
          width,
          "px"
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tip, { text: "Undo (Ctrl+Z)", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn icon", "aria-label": "Undo", disabled: !hist.past.length, onClick: () => setHist((h) => reduce(h, { type: "undo" })), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Undo2, { size: 15 }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tip, { text: "Redo (Ctrl+Y)", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn icon", "aria-label": "Redo", disabled: !hist.future.length, onClick: () => setHist((h) => reduce(h, { type: "redo" })), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Redo2, { size: 15 }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tip, { text: "Clear all marks", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn icon", "aria-label": "Clear", disabled: !doc.shapes.length && !doc.crop, onClick: () => setHist((h) => reduce(h, { type: "clear" })), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Eraser, { size: 15 }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "grow" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "snip-title", children: [
          info.sourceApp ? `${info.sourceApp} \xB7 ` : "",
          info.w,
          " \xD7 ",
          info.h
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tip, { text: "New snip", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn", onClick: onNew, children: "New" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tip, { text: "Close (Esc)", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn icon", "aria-label": "Close", onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(X, { size: 15 }) }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-stage", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "snip-canvas-wrap", style: { width: editable ? stageCss.w : void 0 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("img", { src: preview, alt: "Snip preview", draggable: false, style: editable ? { width: stageCss.w, height: stageCss.h } : { maxWidth: maxStageW, maxHeight: maxStageH } }),
        editable ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "svg",
          {
            ref: svgRef,
            viewBox: `0 0 ${W2} ${H}`,
            onPointerDown: onDown,
            onPointerMove: onMove,
            onPointerUp: onUp,
            style: { cursor: tool === "select" ? "default" : "crosshair" },
            children: [
              suggestions.map(
                (s, i) => isRedacted(doc, s.rect) ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: s.rect.x, y: s.rect.y, width: s.rect.w, height: s.rect.h, rx: 3, fill: "rgba(239,68,68,0.10)", stroke: "#ef4444", strokeDasharray: "6 4", strokeWidth: Math.max(1.5, W2 / 600) }, i)
              ),
              doc.crop ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: doc.crop.x, y: doc.crop.y, width: doc.crop.w, height: doc.crop.h, fill: "none", stroke: "var(--lens-accent)", strokeWidth: Math.max(2, W2 / 400), strokeDasharray: "8 6" }) : null,
              selected ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SelBox, { shape: doc.shapes.find((s) => s.id === selected), scale: W2 / 600 }) : null,
              draft ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DraftShape, { s: draft, crop: tool === "crop" }) : null
            ]
          }
        ) : null,
        textAt ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            className: "snip-input",
            autoFocus: true,
            placeholder: "Type, then Enter",
            value: textAt.value,
            onChange: (e) => setTextAt({ ...textAt, value: e.target.value }),
            onKeyDown: (e) => e.key === "Enter" && commitText(),
            onBlur: commitText,
            style: { position: "absolute", left: textAt.x / W2 * stageCss.w, top: textAt.y / H * stageCss.h, width: 220 }
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tip, { text: "Drag into any app to drop the image", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn icon drag-out", draggable: true, onDragStart: dragStart, "aria-label": "Drag the image out", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(GripVertical, { size: 15 }) }) })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("aside", { className: "snip-panel", "aria-label": "Snip details", children: [
        popover ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          PopoverCard,
          {
            kind: popover,
            isLocal,
            providerLabel: provider?.label ?? "Lens Intelligence",
            aiOn: avail.aiOn,
            ocrChars: ocrText.length,
            info,
            askText,
            setAskText,
            lang,
            setLang,
            apps: apps2,
            recent,
            running: run.status === "running" || run.status === "waiting",
            consent: consent ? { callId: consent.call_id, summary: consent.summary } : null,
            onConsent: (ok) => consent && run.confirm(consent.call_id, ok),
            onCancel: () => {
              run.cancel();
              setPopover(null);
            },
            onClaude: async (target) => {
              try {
                const r = await snipToClaude({ id: info.id, png: png(), ocrText, target });
                if (target === "command") onClose();
                else flash(r.message);
              } catch (e) {
                flash(String(e));
              }
              setPopover(null);
            },
            onAsk: async () => {
              try {
                await snipToClaude({ id: info.id, png: png(), ocrText, target: "command", prompt: askText });
                onClose();
              } catch (e) {
                flash(String(e));
              }
            },
            onTranslate: translate,
            onOpenIn: async (exe) => {
              try {
                const r = await snipOpenIn(info.id, png(), exe);
                flash(r.message);
                setPopover(null);
              } catch (e) {
                flash(String(e));
              }
            }
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "snip-section", "aria-label": "Sensitive details", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("h4", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ShieldCheck, { size: 13 }),
              " Hide sensitive details"
            ] }),
            suggestions.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn", style: { height: 24 }, onClick: acceptAll, children: "Hide all" }) : null
          ] }),
          !settings2.autoRedact ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", children: 'Suggestions are off. Turn on "Suggest what to hide" in Snip settings.' }) : !ocrReady ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", children: "Reading the text on this PC\u2026" }) : suggestions.length ? suggestions.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "snip-sugg", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { type: "checkbox", checked: isRedacted(doc, s.rect), onChange: () => toggleSuggestion(i) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
              s.label,
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("br", {}),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "p", children: s.preview })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "snip-conf", children: s.confidence >= 0.8 ? "Likely" : s.confidence >= 0.6 ? "Maybe" : "Unsure" })
          ] }, i)) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", children: "Nothing that looks like an email, phone, card, key or IP address." }),
          red ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "snip-muted", children: [
            red,
            " area",
            red === 1 ? " is" : "s are",
            " hidden. They're burned into the image you copy, save or share."
          ] }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "snip-section", "aria-label": "Text in the snip", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("h4", { children: [
            "Text",
            avail.hasText ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { type: "button", className: "snip-btn", style: { height: 24 }, onClick: () => void runAction("copyText"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Copy, { size: 12 }),
              " Copy"
            ] }) : null
          ] }),
          analysis?.error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", children: analysis.error }) : null,
          avail.hasText ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-ocr", children: ocrText }) : ocrReady && !analysis?.error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", children: "No text found." }) : null,
          translation.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { type: "button", className: "snip-btn", onClick: () => setTranslation([]), children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Languages, { size: 13 }),
            " Show original text"
          ] }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "snip-section", "aria-label": "Beautify", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h4", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Sparkles, { size: 13 }),
            " Frame"
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 }, children: BEAUTIFY2.map((b) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: `snip-btn ${beautify2 === b.id ? "on" : ""}`, "aria-pressed": beautify2 === b.id, onClick: () => setBeautify(b.id), children: b.label }, b.id)) }),
          !editable ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", children: "Turn the frame off to keep drawing." }) : null
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "snip-actions", role: "toolbar", "aria-label": "Snip actions", children: [
        ACTIONS.map((a, i) => {
          const why = disabledReason(a.id, avail);
          return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tip, { text: why ?? a.hint, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "button",
            {
              type: "button",
              className: `snip-chip ${focus === i ? "focus" : ""} ${done.has(a.id) ? "done" : ""}`,
              disabled: !!why,
              "aria-keyshortcuts": a.key,
              onClick: () => {
                setFocus(i);
                void runAction(a.id);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "k", children: done.has(a.id) ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Check, { size: 12 }) : a.key }),
                a.label
              ]
            }
          ) }, a.id);
        }),
        recent.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sep" }) : null,
        recent.slice(0, 4).map((t) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tip, { text: t.kind === "share" ? "Open the share sheet" : `Copy and bring ${t.label} forward \u2014 you press Send`, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-recent", onClick: recentChip(t), children: t.label }) }, t.id))
      ] }),
      toast ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-toast", role: "status", children: toast }) : null
    ] })
  ] });
};
function union(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
function safeName(title) {
  const t = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().slice(0, 60);
  return t ? `Lens Snip \u2014 ${t}` : "Lens Snip";
}
function bbox(s) {
  switch (s.kind) {
    case "arrow":
      return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    case "text":
      return { x: s.x, y: s.y, w: s.text.length * s.size * 0.6, h: s.size * 1.2 };
    case "step":
      return { x: s.x - 14, y: s.y - 14, w: 28, h: 28 };
    case "pen": {
      const xs = s.points.filter((_, i) => i % 2 === 0);
      const ys = s.points.filter((_, i) => i % 2 === 1);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    default:
      return s.rect;
  }
}
function hitTest(s, p2) {
  const b = bbox(s);
  const pad = 8;
  return p2.x >= b.x - pad && p2.y >= b.y - pad && p2.x <= b.x + b.w + pad && p2.y <= b.y + b.h + pad;
}
var SelBox = ({ shape, scale }) => {
  if (!shape) return null;
  const b = bbox(shape);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: b.x - 6, y: b.y - 6, width: b.w + 12, height: b.h + 12, fill: "none", stroke: "var(--lens-accent)", strokeDasharray: "4 3", strokeWidth: Math.max(1, scale * 1.5) });
};
var DraftShape = ({ s, crop }) => {
  switch (s.kind) {
    case "arrow":
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("line", { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, stroke: s.color, strokeWidth: s.width, strokeLinecap: "round" });
    case "box":
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: s.rect.x, y: s.rect.y, width: s.rect.w, height: s.rect.h, rx: 4, fill: "none", stroke: s.color, strokeWidth: s.width });
    case "highlight":
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: s.rect.x, y: s.rect.y, width: s.rect.w, height: s.rect.h, fill: s.color, opacity: 0.4 });
    case "pixelate":
    case "blur":
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: s.rect.x, y: s.rect.y, width: s.rect.w, height: s.rect.h, fill: "rgba(0,0,0,0.35)", stroke: "#fff", strokeDasharray: "4 3" });
    case "spotlight":
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: s.rect.x, y: s.rect.y, width: s.rect.w, height: s.rect.h, fill: "none", stroke: crop ? "var(--lens-accent)" : "#fff", strokeWidth: 2, strokeDasharray: "6 4" });
    case "pen":
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("polyline", { points: s.points.reduce((a, v, i) => i % 2 ? (a[a.length - 1] += `,${v}`, a) : [...a, String(v)], []).join(" "), fill: "none", stroke: s.color, strokeWidth: s.width, strokeLinecap: "round", strokeLinejoin: "round" });
    default:
      return null;
  }
};
var PopoverCard = (p2) => {
  const dest = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `snip-badge ${p2.isLocal ? "local" : "cloud"}`, children: p2.isLocal ? "Stays on this PC" : `Sent to ${p2.providerLabel}` });
  if (p2.kind === "claude") {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "snip-card", role: "dialog", "aria-label": "Paste to Claude", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "q", children: "Paste to Claude" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", children: "Pick where it goes. Nothing is sent until you press Send there." }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn", style: { justifyContent: "flex-start" }, onClick: () => p2.onClaude("desktop"), children: "Claude Desktop \u2014 copy and bring it forward (you press Ctrl+V)" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn", style: { justifyContent: "flex-start" }, onClick: () => p2.onClaude("command"), children: "Lens Command \u2014 attach the image and its text" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("table", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tbody", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { children: "Image" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("td", { children: [
            p2.info.w,
            " \xD7 ",
            p2.info.h,
            ", with your marks and hidden areas"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { children: "Text" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { children: p2.ocrChars ? `${p2.ocrChars.toLocaleString()} characters from OCR` : "None" })
        ] })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "row", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn", onClick: p2.onCancel, children: "Cancel" }) })
    ] });
  }
  if (p2.kind === "ask") {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "snip-card", role: "dialog", "aria-label": "Ask about this snip", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "q", children: "Ask about this snip" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { className: "snip-input", autoFocus: true, placeholder: "What does this error mean?", value: p2.askText, onChange: (e) => p2.setAskText(e.target.value), onKeyDown: (e) => e.key === "Enter" && p2.onAsk() }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", children: "Opens in Lens Command with the image and its text attached. Your AI settings decide where it's answered." }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn", onClick: p2.onCancel, children: "Cancel" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn primary", onClick: p2.onAsk, children: "Ask" })
      ] })
    ] });
  }
  if (p2.kind === "translate") {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "snip-card", role: "dialog", "aria-label": "Translate", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "q", children: "Translate the text in place" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("select", { className: "snip-input", value: p2.lang, onChange: (e) => p2.setLang(e.target.value), "aria-label": "Language", children: LANGS.map((l) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { children: l }, l)) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("table", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tbody", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { children: "Sends" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("td", { children: [
            p2.ocrChars.toLocaleString(),
            " characters of text (not the image)"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { children: "To" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { children: dest })
        ] })
      ] }) }),
      p2.consent ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "snip-card", style: { borderColor: "var(--lens-accent)" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "q", children: "Needs your OK" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", children: p2.consent.summary }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn", onClick: () => p2.onConsent(false), children: "Deny" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn primary", onClick: () => p2.onConsent(true), children: "Send" })
        ] })
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn", onClick: p2.onCancel, children: "Cancel" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn primary", disabled: !p2.aiOn || p2.running, onClick: p2.onTranslate, children: p2.running ? "Translating\u2026" : "Translate" })
      ] })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "snip-card", role: "dialog", "aria-label": "Send to an app", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "q", children: "Send to an app" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", children: "Lens copies the image and brings the app forward. You paste it and press Send yourself." }),
    p2.recent.filter((r) => r.kind === "app").length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", children: "Recent" }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "snip-applist", children: [
      p2.recent.filter((r) => r.kind === "app" && r.exe).map((r) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn", onClick: () => p2.onOpenIn(r.exe), children: r.label }, r.id)),
      p2.apps.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "snip-muted", style: { marginTop: 4 }, children: "Open now" }) : null,
      p2.apps.map((a) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { type: "button", className: "snip-btn", onClick: () => p2.onOpenIn(a.exe), children: [
        a.app,
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "snip-muted", style: { marginLeft: 6, overflow: "hidden", textOverflow: "ellipsis" }, children: a.title })
      ] }, a.hwnd))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "row", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "snip-btn", onClick: p2.onCancel, children: "Cancel" }) })
  ] });
};

// src/snip/Pin.tsx
var import_react9 = __toESM(require_react(), 1);

// tools/parity/mock/window.ts
var noop = async () => {
};
function getCurrentWindow2() {
  return new Proxy({}, { get: (_t, k) => k === "label" ? "harness" : k === "onFocusChanged" ? async () => () => {
  } : noop });
}

// tools/parity/snip/mockWindow.ts
var LogicalSize2 = class {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
  width;
  height;
};

// src/snip/Pin.tsx
var import_jsx_runtime4 = __toESM(require_jsx_runtime(), 1);
var Pin2 = ({ label, demo }) => {
  const [info, setInfo] = (0, import_react9.useState)(demo ?? null);
  const [opacity, setOpacity] = (0, import_react9.useState)(demo?.opacity ?? 1);
  const [zoom, setZoom] = (0, import_react9.useState)(1);
  const [through, setThrough] = (0, import_react9.useState)(false);
  const [msg, setMsg] = (0, import_react9.useState)("");
  (0, import_react9.useEffect)(() => {
    if (demo) return;
    snipPinInfo(label).then((i) => {
      setInfo(i);
      setOpacity(i.opacity);
      if (i.clickThrough) {
        setThrough(true);
        void snipPinClickThrough(label, true);
      }
    }).catch(() => void getCurrentWindow2().close());
  }, [label, demo]);
  const close = () => void snipPinClose(label).catch(() => void getCurrentWindow2().close());
  (0, import_react9.useEffect)(() => {
    const onKey2 = (e) => {
      if (e.key === "Escape") close();
      if (e.ctrlKey && e.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", onKey2);
    return () => window.removeEventListener("keydown", onKey2);
  });
  if (!info) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "div",
    {
      className: "snip-root snip-pin",
      style: { opacity },
      onPointerDown: (e) => {
        if (e.target.closest(".snip-pin-bar")) return;
        void getCurrentWindow2().startDragging().catch(() => {
        });
      },
      onDoubleClick: close,
      onWheel: (e) => {
        if (!e.ctrlKey) return;
        setZoom((z) => Math.min(8, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
      },
      "aria-label": `Pinned snip${info.title ? ` \u2014 ${info.title}` : ""}`,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("img", { src: info.png, alt: "", draggable: false, style: { transform: `scale(${zoom})` } }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "snip-pin-bar", role: "toolbar", "aria-label": "Pin controls", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Tip, { text: "Opacity", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { type: "range", min: 0.2, max: 1, step: 0.05, value: opacity, onChange: (e) => setOpacity(Number(e.target.value)), "aria-label": "Opacity" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Tip, { text: "Copy the image", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "button",
            {
              type: "button",
              className: "snip-btn icon",
              "aria-label": "Copy",
              onClick: async () => {
                try {
                  const blob = await (await fetch(info.png)).blob();
                  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
                  setMsg("Copied");
                } catch {
                  setMsg("Couldn't copy");
                }
                window.setTimeout(() => setMsg(""), 1500);
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Copy, { size: 14 })
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Tip, { text: "Click-through: clicks go to the window underneath. Open Lens Snip to turn it off.", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "button",
            {
              type: "button",
              className: `snip-btn icon ${through ? "on" : ""}`,
              "aria-pressed": through,
              "aria-label": "Click-through",
              onClick: () => {
                setThrough(true);
                void snipPinClickThrough(label, true);
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(MousePointerClick, { size: 14 })
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Tip, { text: "Close (Esc or double-click)", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "snip-btn icon", "aria-label": "Close pin", onClick: close, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(X, { size: 14 }) }) })
        ] }),
        msg ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "snip-toast", style: { bottom: 8 }, children: msg }) : null,
        zoom !== 1 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "snip-size", style: { left: 8, bottom: 8 }, children: [
          Math.round(zoom * 100),
          "%"
        ] }) : null
      ]
    }
  );
};

// src/snip/Record.tsx
var import_react10 = __toESM(require_react(), 1);
var import_jsx_runtime5 = __toESM(require_jsx_runtime(), 1);
var RecBorder = () => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "snip-root snip-rec-border", "aria-hidden": true });
var fmt = (ms) => {
  const s = Math.floor(ms / 1e3);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
var RecBar = ({ demo }) => {
  const [st, setSt] = (0, import_react10.useState)(demo ?? null);
  const [now3, setNow] = (0, import_react10.useState)(Date.now());
  const [startedAt, setStartedAt] = (0, import_react10.useState)(Date.now() - (demo?.elapsedMs ?? 0));
  const [trim, setTrim] = (0, import_react10.useState)(null);
  const [msg, setMsg] = (0, import_react10.useState)("");
  (0, import_react10.useEffect)(() => {
    if (demo) return;
    snipRecordState().then((s) => {
      setSt(s);
      setStartedAt(Date.now() - s.elapsedMs);
    });
    const un = on(EVT.record, (s) => {
      setSt(s);
      if (s.recording) setStartedAt(Date.now() - s.elapsedMs);
    });
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearInterval(t);
      un.then((f) => f()).catch(() => {
      });
    };
  }, [demo]);
  const stop = async () => {
    try {
      const s = await snipRecordStop();
      setSt(s);
      void getCurrentWindow2().setSize(new LogicalSize2(360, 40)).catch(() => {
      });
      void getCurrentWindow2().show().catch(() => {
      });
    } catch (e) {
      setMsg(String(e));
    }
  };
  if (!st) return null;
  if (st.recording) {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "snip-root snip-recbar", role: "toolbar", "aria-label": "Recording", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "snip-recdot", "aria-hidden": true }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { "aria-live": "off", children: fmt(demo ? st.elapsedMs : now3 - startedAt) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "grow" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("button", { type: "button", className: "snip-btn danger", onClick: stop, "aria-label": "Stop recording", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Square, { size: 13, fill: "currentColor" }),
        " Stop"
      ] })
    ] });
  }
  const name = st.path?.split(/[\\/]/).pop() ?? "Recording";
  const isMp4 = !!st.path?.toLowerCase().endsWith(".mp4");
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "snip-root snip-recbar", role: "status", "aria-label": "Recording saved", children: trim ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { className: "snip-input", style: { width: 64, height: 28 }, "aria-label": "Start (seconds)", value: trim.start, onChange: (e) => setTrim({ ...trim, start: e.target.value }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u2013" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { className: "snip-input", style: { width: 64, height: 28 }, "aria-label": "End (seconds)", value: trim.end, onChange: (e) => setTrim({ ...trim, end: e.target.value }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "button",
      {
        type: "button",
        className: "snip-btn primary",
        onClick: async () => {
          try {
            const out = await snipRecordTrim(st.path, Number(trim.start) || 0, Number(trim.end) || st.elapsedMs / 1e3);
            setMsg(`Saved ${out.split(/[\\/]/).pop()}`);
            setTrim(null);
          } catch (e) {
            setMsg(String(e));
          }
        },
        children: "Trim"
      }
    )
  ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: msg || `Saved \xB7 ${name}` }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "grow" }),
    isMp4 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("button", { type: "button", className: "snip-btn", onClick: () => setTrim({ start: "0", end: (st.elapsedMs / 1e3).toFixed(1) }), children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Scissors, { size: 13 }),
      " Trim"
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "snip-btn", onClick: () => void getCurrentWindow2().hide(), children: "Done" })
  ] }) });
};

// src/snip/HistoryView.tsx
var import_react11 = __toESM(require_react(), 1);
var import_jsx_runtime6 = __toESM(require_jsx_runtime(), 1);
var when = (ms) => {
  const d = new Date(ms);
  const today = /* @__PURE__ */ new Date();
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};
var HistoryView = ({ demo, compact }) => {
  const [q, setQ] = (0, import_react11.useState)("");
  const [items, setItems] = (0, import_react11.useState)(demo ?? []);
  const [err, setErr] = (0, import_react11.useState)("");
  (0, import_react11.useEffect)(() => {
    if (demo) {
      const t = q.trim().toLowerCase();
      setItems(t ? demo.filter((e) => `${e.ocrText} ${e.windowTitle} ${e.sourceApp} ${e.tags.join(" ")}`.toLowerCase().includes(t)) : demo);
      return;
    }
    const load = () => snipHistory(q).then(setItems).catch((e) => setErr(String(e)));
    load();
    const un = on(EVT.history, load);
    return () => {
      un.then((f) => f()).catch(() => {
      });
    };
  }, [q, demo]);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "snip-history", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { position: "relative" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Search, { size: 14, style: { position: "absolute", left: 10, top: 9, opacity: 0.6 } }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("input", { className: "snip-input", style: { paddingLeft: 30 }, placeholder: "Search text in your snips, apps or #tags", value: q, onChange: (e) => setQ(e.target.value), "aria-label": "Search snips" })
    ] }),
    err ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "snip-muted", children: err }) : null,
    !items.length ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "snip-muted", children: q ? "No snips match." : "Snips you copy, save, pin or share appear here. They stay on this PC, encrypted." }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "snip-grid", children: items.slice(0, compact ? 8 : 200).map((e) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: `snip-thumb ${e.pinned ? "pinned" : ""}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("button", { type: "button", style: { all: "unset", cursor: "pointer", display: "block", width: "100%" }, onClick: () => void snipHistoryOpen(e.id).catch((x) => setErr(String(x))), "aria-label": `Open snip from ${e.sourceApp || "screen"}`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("img", { src: e.thumb, alt: "" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: e.windowTitle || e.sourceApp || "Snip" }),
          when(e.createdMs),
          " \xB7 ",
          e.w,
          "\xD7",
          e.h,
          e.tags.length ? ` \xB7 ${e.tags.map((t) => `#${t}`).join(" ")}` : ""
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "tools", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Tip, { text: e.pinned ? "Kept \u2014 retention won't remove it" : "Keep this snip", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: `snip-btn icon ${e.pinned ? "on" : ""}`, "aria-label": "Keep", "aria-pressed": e.pinned, onClick: () => void snipHistoryPin(e.id, !e.pinned), children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Pin, { size: 12 }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Tip, { text: "Delete from history", below: true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "snip-btn icon danger", "aria-label": "Delete", onClick: () => void snipHistoryDelete(e.id), children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Trash2, { size: 12 }) }) })
      ] })
    ] }, e.id)) })
  ] });
};

// src/components/SnipCard.tsx
var import_react12 = __toESM(require_react(), 1);
var import_jsx_runtime7 = __toESM(require_jsx_runtime(), 1);
var MODES2 = [
  ["region", "Region"],
  ["window", "Window"],
  ["monitor", "Screen"],
  ["all", "All screens"],
  ["freeform", "Freeform"],
  ["last", "Last region"]
];
var AFTER = [
  ["studio", "Open the studio"],
  ["copy", "Copy"],
  ["save", "Save"],
  ["pin", "Pin"],
  ["shelf", "Shelf"]
];
var BEAUTIFY3 = [
  ["none", "Off"],
  ["soft", "Soft"],
  ["vivid", "Vivid"],
  ["mono", "Mono"],
  ["theme", "Theme"]
];
var KEEP_DAYS = [7, 30, 90, 365];
var Chips = ({ value, options, onPick, label }) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { role: "radiogroup", "aria-label": label, style: { display: "flex", flexWrap: "wrap", gap: 4 }, children: options.map(([v, l]) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", role: "radio", "aria-checked": value === v, className: `snip-btn ${value === v ? "on" : ""}`, onClick: () => onPick(String(v)), children: l }, String(v))) });
var Row = ({ label, desc, children }) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "cc-row", style: { alignItems: "flex-start", gap: 16 }, children: [
  /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { minWidth: 0 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "cc-label", children: label }),
    desc ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "cc-desc", children: desc }) : null
  ] }),
  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { style: { flex: "none", maxWidth: "60%", display: "flex", justifyContent: "flex-end" }, children })
] });
var Toggle = ({ on: on2, label, onChange }) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", role: "switch", "aria-checked": on2, "aria-label": label, className: `cc-toggle ${on2 ? "on" : ""}`, onClick: () => onChange(!on2) });
var SnipCard = ({ demo }) => {
  const [st, setSt] = (0, import_react12.useState)(demo ?? null);
  const [mics, setMics] = (0, import_react12.useState)([]);
  const [msg, setMsg] = (0, import_react12.useState)("");
  const [confirmClear, setConfirmClear] = (0, import_react12.useState)(false);
  const s = st?.settings ?? DEFAULT_SNIP_SETTINGS;
  (0, import_react12.useEffect)(() => {
    if (demo) return;
    snipStatus().then(setSt).catch(() => setSt(null));
  }, [demo]);
  const save = (patch) => {
    const next = { ...s, ...patch };
    setSt((x) => x ? { ...x, settings: next } : x);
    if (demo) return;
    snipSetSettings(next).then(setSt).catch((e) => setMsg(String(e)));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "cc-card", "data-guide-id": "snip-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Lens Snip", desc: "Capture any part of the screen, then mark it up, hide private details, pin it, or send it on \u2014 before anything is saved.", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Toggle, { on: s.enabled, label: "Lens Snip", onChange: (v) => save({ enabled: v }) }) }),
    s.enabled ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("button", { type: "button", className: "snip-btn primary", onClick: () => void snipStart().catch((e) => setMsg(String(e))), children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Camera, { size: 14 }),
          " Snip now"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "cc-desc", children: [
          "or press ",
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "snip-kbd", children: s.hotkey }),
          st && !st.hotkeyOk ? " \u2014 not registered" : ""
        ] })
      ] }),
      st?.message ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "cc-desc", role: "status", children: st.message }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Shortcut", desc: "A modifier plus a key, e.g. Ctrl+Shift+S. Press it again while recording to stop.", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { className: "snip-input", style: { width: 160 }, value: s.hotkey, "aria-label": "Snip shortcut", onChange: (e) => setSt((x) => x ? { ...x, settings: { ...s, hotkey: e.target.value } } : x), onBlur: () => save({ hotkey: s.hotkey }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Use the Print Screen key", desc: "Lens takes over Print Screen and gives it back to Windows when you turn this off or close Lens. A Windows policy can keep the key; your shortcut still works.", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Toggle, { on: s.printScreen, label: "Use the Print Screen key", onChange: (v) => save({ printScreen: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Start in", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Chips, { value: s.defaultMode, options: MODES2, label: "Default capture mode", onPick: (v) => save({ defaultMode: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "After a capture", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Chips, { value: s.afterCapture, options: AFTER, label: "After a capture", onPick: (v) => save({ afterCapture: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Include the pointer", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Toggle, { on: s.includeCursor, label: "Include the pointer", onChange: (v) => save({ includeCursor: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "cc-label", style: { marginTop: 16 }, children: "Before you save" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Suggest what to hide", desc: "Reads the text in each snip with Windows OCR on this PC and suggests blurring emails, phone numbers, card numbers, keys and IP addresses. You decide what's hidden.", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Toggle, { on: s.autoRedact, label: "Suggest what to hide", onChange: (v) => save({ autoRedact: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Text language", desc: st?.ocrLanguages.length ? `Installed: ${st.ocrLanguages.join(", ")}` : "Uses the Windows OCR language packs for your languages.", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { className: "snip-input", style: { width: 160 }, value: s.ocrLanguage, "aria-label": "OCR language", onChange: (e) => save({ ocrLanguage: e.target.value }), children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "auto", children: "Automatic" }),
        (st?.ocrLanguages ?? []).map((l) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: l, children: l }, l))
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Frame", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Chips, { value: s.beautify, options: BEAUTIFY3, label: "Frame preset", onPick: (v) => save({ beautify: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "cc-label", style: { marginTop: 16 }, children: "Saving and sharing" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Save to", desc: "Empty = Pictures\\Screenshots\\Lens. Recordings go to Videos\\Lens.", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { className: "snip-input", style: { width: 220 }, placeholder: "Pictures\\Screenshots\\Lens", value: s.saveDir, "aria-label": "Save folder", onChange: (e) => setSt((x) => x ? { ...x, settings: { ...s, saveDir: e.target.value } } : x), onBlur: () => save({ saveDir: s.saveDir }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "File name", desc: "{date} {time} {app} {title} {w} {h} {n:3}", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { className: "snip-input", style: { width: 220 }, value: s.filenameTemplate, "aria-label": "File name template", onChange: (e) => setSt((x) => x ? { ...x, settings: { ...s, filenameTemplate: e.target.value } } : x), onBlur: () => save({ filenameTemplate: s.filenameTemplate }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Recent apps", desc: "One-click chips for the apps and share targets you used last. Lens copies the snip and brings the app forward \u2014 you always press Send yourself.", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "snip-btn", onClick: () => void snipRecentClear().then(() => setMsg("Recent apps cleared")), children: "Clear" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Toggle, { on: s.showRecent, label: "Show recent apps", onChange: (v) => save({ showRecent: v }) })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Pins", desc: "Pinned snips float above your windows.", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { type: "range", min: 0.2, max: 1, step: 0.05, value: s.pinOpacity, "aria-label": "Pin opacity", onChange: (e) => save({ pinOpacity: Number(e.target.value) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "snip-btn", onClick: () => void snipPinsRelease(), children: "Make pins clickable" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "cc-label", style: { marginTop: 16 }, children: "Recording" }),
      st && !st.canRecord ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "cc-desc", children: "Recording uses ffmpeg. Set it up under Transcription, or install ffmpeg and restart Lens." }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Format", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Chips, { value: s.recordFormat, options: [["mp4", "MP4 video"], ["gif", "GIF"]], label: "Recording format", onPick: (v) => save({ recordFormat: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Quality", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Chips, { value: s.recordQuality, options: [["small", "Small"], ["balanced", "Balanced"], ["best", "Best"]], label: "Recording quality", onPick: (v) => save({ recordQuality: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Frames per second", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Chips, { value: s.recordFps, options: [[15, "15"], [30, "30"], [60, "60"]], label: "Frames per second", onPick: (v) => save({ recordFps: Number(v) }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Microphone", desc: "Off unless you pick one.", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { className: "snip-input", style: { width: 220 }, value: s.recordMic, "aria-label": "Microphone", onFocus: () => !mics.length && !demo && snipRecordMics().then(setMics).catch(() => {
      }), onChange: (e) => save({ recordMic: e.target.value }), children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "", children: "No microphone" }),
        [...new Set([s.recordMic, ...mics].filter(Boolean))].map((m) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: m, children: m }, m))
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "cc-label", style: { marginTop: 16, display: "flex", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ShieldCheck, { size: 13 }),
        " History \u2014 on this PC, encrypted, never synced"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Keep a history", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Toggle, { on: s.historyEnabled, label: "Keep a history", onChange: (v) => save({ historyEnabled: v }) }) }),
      s.historyEnabled ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Row, { label: "Keep for", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Chips, { value: s.historyDays, options: KEEP_DAYS.map((d) => [d, d >= 365 ? "1 year" : `${d} days`]), label: "Keep history for", onPick: (v) => save({ historyDays: Number(v) }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(HistoryView, { compact: true, demo: demo ? [] : void 0 }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }, children: confirmClear ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "cc-desc", children: "Delete every snip in history? This can't be undone." }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "snip-btn", onClick: () => setConfirmClear(false), children: "Cancel" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "snip-btn danger", onClick: () => void snipHistoryClear().then((n) => {
            setMsg(`Deleted ${n} snips`);
            setConfirmClear(false);
          }), children: "Delete all" })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "snip-btn danger", onClick: () => setConfirmClear(true), children: "Clear history\u2026" }) })
      ] }) : null
    ] }) : null,
    msg ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "cc-desc", role: "status", style: { marginTop: 8 }, children: msg }) : null
  ] });
};

// tools/parity/snip/entry.tsx
var import_jsx_runtime8 = __toESM(require_jsx_runtime(), 1);
var p = new URLSearchParams(location.search);
var scene = p.get("scene") || "studio";
var VW = 1280;
var VH = 800;
function paintDesktop() {
  const c = document.createElement("canvas");
  c.width = VW;
  c.height = VH;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, VW, VH);
  bg.addColorStop(0, "#1e293b");
  bg.addColorStop(0.55, "#312e81");
  bg.addColorStop(1, "#0f172a");
  g.fillStyle = bg;
  g.fillRect(0, 0, VW, VH);
  const win2 = { x: 700, y: 250, w: 520, h: 420 };
  g.fillStyle = "#1e1e2e";
  rr(g, win2.x, win2.y, win2.w, win2.h, 8);
  g.fill();
  g.fillStyle = "#11111b";
  g.fillRect(win2.x, win2.y, win2.w, 32);
  g.font = "13px Consolas, monospace";
  const code = ["fn main() {", '    let key = env::var("LENS_KEY")?;', '    serve("10.0.0.12:443", key)', "}"];
  code.forEach((l, i) => {
    g.fillStyle = ["#cba6f7", "#cdd6f4", "#a6e3a1", "#cba6f7"][i];
    g.fillText(l, win2.x + 24, win2.y + 64 + i * 22);
  });
  const win1 = { x: 60, y: 60, w: 760, h: 480 };
  g.save();
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = 32;
  g.fillStyle = "#ffffff";
  rr(g, win1.x, win1.y, win1.w, win1.h, 8);
  g.fill();
  g.restore();
  g.fillStyle = "#f1f5f9";
  g.fillRect(win1.x, win1.y, win1.w, 40);
  g.fillStyle = "#e2e8f0";
  rr(g, win1.x + 120, win1.y + 8, 420, 24, 12);
  g.fill();
  g.fillStyle = "#64748b";
  g.font = "12px Segoe UI, system-ui, sans-serif";
  g.fillText("admin.example.com/settings/api", win1.x + 136, win1.y + 24);
  g.fillStyle = "#0f172a";
  g.font = "600 22px Segoe UI, system-ui, sans-serif";
  g.fillText("Account settings", win1.x + 40, win1.y + 92);
  g.font = "15px Segoe UI, system-ui, sans-serif";
  const lines = [
    ["Owner:", "jane.doe@example.com"],
    ["Phone:", "+1", "415", "555", "0142"],
    ["API", "key:", "sk-proj-9fQ2mZ7pL4vB8nR1tY6wE3sD"],
    ["Webhook", "server:", "10.20.30.40:8080"],
    ["Plan:", "Team", "\xB7", "12", "seats", "\xB7", "renews", "1", "March"]
  ];
  const words = [];
  lines.forEach((ws, li) => {
    let x = win1.x + 40;
    const y = win1.y + 140 + li * 40;
    const line = [];
    ws.forEach((w) => {
      g.fillStyle = w.includes("@") || w.startsWith("sk-") ? "#2563eb" : "#334155";
      g.fillText(w, x, y);
      const m = g.measureText(w).width;
      line.push({ text: w, rect: { x: x - win1.x, y: y - 15 - win1.y, w: Math.ceil(m), h: 20 } });
      x += m + 6;
    });
    words.push(line);
  });
  g.fillStyle = "#e2e8f0";
  g.fillRect(win1.x + 40, win1.y + 360, 680, 1);
  g.fillStyle = "#2563eb";
  rr(g, win1.x + 40, win1.y + 390, 140, 36, 8);
  g.fill();
  g.fillStyle = "#fff";
  g.font = "600 14px Segoe UI, system-ui, sans-serif";
  g.fillText("Rotate key", win1.x + 72, win1.y + 413);
  g.fillStyle = "rgba(15,15,20,0.75)";
  rr(g, VW / 2 - 220, VH - 64, 440, 52, 16);
  g.fill();
  ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6"].forEach((col, i) => {
    g.fillStyle = col;
    rr(g, VW / 2 - 196 + i * 60, VH - 54, 36, 36, 9);
    g.fill();
  });
  return { frame: c.toDataURL("image/png"), win1, win2, words };
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function cropDataUrl(src, r) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = r.w;
      c.height = r.h;
      c.getContext("2d").drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      res(c.toDataURL("image/png"));
    };
    img.src = src;
  });
}
var union2 = (ws) => {
  const x = Math.min(...ws.map((w) => w.rect.x));
  const y = Math.min(...ws.map((w) => w.rect.y));
  return { x: x - 3, y: y - 3, w: Math.max(...ws.map((w) => w.rect.x + w.rect.w)) - x + 6, h: Math.max(...ws.map((w) => w.rect.y + w.rect.h)) - y + 6 };
};
var Gallery = () => {
  useLensState();
  const [d, setD] = (0, import_react13.useState)(null);
  const [snip, setSnip] = (0, import_react13.useState)(null);
  (0, import_react13.useEffect)(() => {
    const drawn = paintDesktop();
    setD(drawn);
    cropDataUrl(drawn.frame, drawn.win1).then(
      (png) => setSnip({ id: "snip-demo", w: drawn.win1.w, h: drawn.win1.h, png, screenRect: drawn.win1, sourceApp: "Msedge", sourceTitle: "Account settings \u2014 Microsoft Edge" })
    );
  }, []);
  if (!d || !snip) return null;
  const session = {
    id: "session-demo",
    mode: scene === "select-window" ? "window" : "region",
    origin: { x: 0, y: 0, w: VW, h: VH },
    monitors: [{ id: "mon-0", rect: { x: 0, y: 0, w: VW, h: VH }, scale: 1, primary: true }],
    windows: [
      { hwnd: 1, rect: d.win1, title: "Account settings \u2014 Microsoft Edge", app: "Msedge", exe: "C:\\x\\msedge.exe" },
      { hwnd: 2, rect: d.win2, title: "main.rs \u2014 LensUI", app: "Code", exe: "C:\\x\\Code.exe" }
    ],
    frame: d.frame,
    sourceApp: "Msedge",
    lastRegion: null
  };
  const W2 = d.words;
  const suggestions = [
    { kind: "email", label: "Email address", rect: union2([W2[0][1]]), confidence: 0.95, preview: "ja\u2022\u2022\u2022om" },
    { kind: "phone", label: "Phone number", rect: union2(W2[1].slice(1)), confidence: 0.8, preview: "+1\u2022\u2022\u202242" },
    { kind: "secret", label: "Key or token", rect: union2([W2[2][2]]), confidence: 0.95, preview: "sk\u2022\u2022\u2022sD" },
    { kind: "ip", label: "IP address", rect: union2([W2[3][2]]), confidence: 0.7, preview: "10\u2022\u2022\u202280" }
  ];
  const ocrText = W2.map((l) => l.map((w) => w.text).join(" ")).join("\n");
  const analysis = {
    ocr: { language: "en-US", text: `Account settings
${ocrText}
Rotate key`, lines: W2.map((l) => ({ words: l })) },
    suggestions,
    error: null
  };
  let hist = empty();
  hist = reduce(hist, { type: "redact", rects: [{ rect: suggestions[0].rect, label: "Email address" }, { rect: suggestions[2].rect, label: "Key or token" }] });
  hist = reduce(hist, { type: "add", shape: { id: "a1", kind: "box", rect: { x: 32, y: 368, w: 156, h: 66 }, color: "#ef4444", width: 4 } });
  hist = reduce(hist, { type: "add", shape: { id: "a2", kind: "arrow", x1: 340, y1: 430, x2: 200, y2: 404, color: "#ef4444", width: 4 } });
  hist = reduce(hist, { type: "add", shape: { id: "a3", kind: "step", x: 22, y: 220, n: 0, color: "#3b82f6" } });
  hist = reduce(hist, { type: "add", shape: { id: "a4", kind: "step", x: 210, y: 404, n: 0, color: "#3b82f6" } });
  hist = reduce(hist, { type: "add", shape: { id: "a5", kind: "text", x: 352, y: 418, text: "Rotate this key first", size: 18, color: "#ef4444" } });
  const ai = {
    providers: [
      { id: "local", kind: "local", label: "Ollama \xB7 llama3.2", available: true, model: "llama3.2:3b", is_local: true, needs_key: false, has_key: false },
      { id: "claude", kind: "claude", label: "Claude", available: true, model: "claude-sonnet-5-5", is_local: false, needs_key: true, has_key: true }
    ],
    active: "local",
    privacy: "ask_each_time"
  };
  const area2 = { x: 24, y: 24, w: VW - 48, h: VH - 48 };
  const base2 = { info: snip, ai, area: area2, analysis, onClose: () => {
  }, onNew: () => {
  } };
  const desktop = (children) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { position: "fixed", inset: 0, background: `url(${d.frame}) 0 0 / ${VW}px ${VH}px` }, children });
  switch (scene) {
    case "select":
      return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Select, { session, initialMode: "region", delay: 0, onDelay: () => {
      }, cursor: false, onCursor: () => {
      }, onDone: () => {
      }, onCancel: () => {
      }, demo: { rect: { x: 92, y: 170, w: 420, h: 196 }, pointer: { x: 512, y: 366 } } });
    case "select-window":
      return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Select, { session, initialMode: "window", delay: 3, onDelay: () => {
      }, cursor: true, onCursor: () => {
      }, onDone: () => {
      }, onCancel: () => {
      }, demo: { pointer: { x: 900, y: 420 } } });
    case "studio":
      return desktop(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "snip-root", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Studio, { ...base2, settings: DEFAULT_SNIP_SETTINGS, demo: { history: hist, focus: 0 } }) }));
    case "studio-claude":
      return desktop(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "snip-root", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Studio, { ...base2, settings: DEFAULT_SNIP_SETTINGS, demo: { history: hist, popover: "claude", focus: 5 } }) }));
    case "studio-translate":
      return desktop(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "snip-root", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Studio, { ...base2, settings: DEFAULT_SNIP_SETTINGS, demo: { history: hist, popover: "translate", focus: 7 } }) }));
    case "studio-openin":
      return desktop(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "snip-root", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Studio, { ...base2, settings: DEFAULT_SNIP_SETTINGS, demo: { history: hist, popover: "openIn", focus: 9, toast: "Image copied \u2014 paste it in Discord with Ctrl+V, then send it yourself." } }) }));
    case "studio-frame":
      return desktop(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "snip-root", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Studio, { ...base2, settings: { ...DEFAULT_SNIP_SETTINGS, beautify: "vivid" }, demo: { history: hist, focus: 2, toast: "Saved \u2014 C:\\Users\\u\\Pictures\\Screenshots\\Lens\\Lens Snip 2026-11-22 at 13.12.04.png" } }) }));
    case "pin":
      return desktop(
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "pin-demo", style: { position: "absolute", left: 760, top: 96, width: 400, height: 253, transform: "translateZ(0)", borderRadius: 8, overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,.5)" }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Pin2, { label: "snip-pin-1", demo: { png: snip.png, w: snip.w, h: snip.h, opacity: 0.92, clickThrough: false, title: snip.sourceTitle } }) })
      );
    case "record": {
      const r = { x: 80, y: 120, w: 720, h: 440 };
      return desktop(
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { position: "absolute", left: r.x - 4, top: r.y - 4, width: r.w + 8, height: r.h + 8, transform: "translateZ(0)" }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(RecBorder, {}) }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { position: "absolute", left: r.x + r.w / 2 - 110, top: r.y - 52, width: 220, height: 40, transform: "translateZ(0)" }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(RecBar, { demo: { recording: true, elapsedMs: 83e3, path: "C:\\Users\\u\\Videos\\Lens\\Lens Recording.mp4", message: "Recording" } }) }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { position: "absolute", left: r.x + r.w / 2 - 180, top: r.y + r.h + 24, width: 360, height: 40, transform: "translateZ(0)" }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(RecBar, { demo: { recording: false, elapsedMs: 83e3, path: "C:\\Users\\u\\Videos\\Lens\\Lens Recording 2026-11-22 at 13.20.11.mp4", message: "Saved" } }) })
        ] })
      );
    }
    case "history": {
      const entries = [
        ["Account settings \u2014 Microsoft Edge", "Msedge", "Owner Phone API key", ["work"], true],
        ["main.rs \u2014 LensUI", "Code", "fn main let key env var", ["code", "bug"], false],
        ["Design review \u2014 Figma", "Figma", "Lens Snip pre-save studio", [], false],
        ["Inbox \u2014 Outlook", "Olk", "Invoice due Friday", ["billing"], false],
        ["#design \u2014 Discord", "Discord", "ship it", [], false],
        ["Terminal", "WindowsTerminal", "error[E0599] no method named", ["bug"], false]
      ].map(([t, a, o, tags, pinned], i) => ({
        id: `h${i}`,
        createdMs: Date.now() - i * 54e5,
        w: 760 - i * 40,
        h: 480 - i * 20,
        kind: "image",
        sourceApp: a,
        windowTitle: t,
        ocrText: o,
        tags,
        pinned,
        file: "",
        bytes: 0,
        thumb: i % 2 ? d.frame : snip.png
      }));
      return desktop(
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { position: "absolute", left: 120, top: 80, width: 760, padding: 16, borderRadius: 14, background: "var(--lens-bg-surface)", border: "1px solid var(--lens-border)", backdropFilter: "blur(20px)" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "cc-label", style: { marginBottom: 8 }, children: "Snip history" }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(HistoryView, { demo: entries })
        ] })
      );
    }
    case "card":
      return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { padding: 24, maxWidth: 760, margin: "0 auto" }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(SnipCard, { demo: { settings: { ...DEFAULT_SNIP_SETTINGS, enabled: true, printScreen: true }, ocrLanguages: ["en-US", "de-DE"], canRecord: true, hotkeyOk: true, printScreenOwned: true, message: "", recording: false } }) });
    default:
      return null;
  }
};
import_client2.default.createRoot(document.getElementById("root")).render(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Gallery, {}));
/*! Bundled license information:

react/cjs/react.production.js:
  (**
   * @license React
   * react.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

scheduler/cjs/scheduler.production.js:
  (**
   * @license React
   * scheduler.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom.production.js:
  (**
   * @license React
   * react-dom.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom-client.production.js:
  (**
   * @license React
   * react-dom-client.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.production.js:
  (**
   * @license React
   * react-jsx-runtime.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/shared/src/utils.js:
lucide-react/dist/esm/defaultAttributes.js:
lucide-react/dist/esm/Icon.js:
lucide-react/dist/esm/createLucideIcon.js:
lucide-react/dist/esm/icons/app-window.js:
lucide-react/dist/esm/icons/arrow-up-right.js:
lucide-react/dist/esm/icons/camera.js:
lucide-react/dist/esm/icons/check.js:
lucide-react/dist/esm/icons/clock.js:
lucide-react/dist/esm/icons/copy.js:
lucide-react/dist/esm/icons/crop.js:
lucide-react/dist/esm/icons/droplets.js:
lucide-react/dist/esm/icons/eraser.js:
lucide-react/dist/esm/icons/grid-3x3.js:
lucide-react/dist/esm/icons/grip-vertical.js:
lucide-react/dist/esm/icons/highlighter.js:
lucide-react/dist/esm/icons/languages.js:
lucide-react/dist/esm/icons/lasso.js:
lucide-react/dist/esm/icons/list-ordered.js:
lucide-react/dist/esm/icons/monitor.js:
lucide-react/dist/esm/icons/mouse-pointer-2.js:
lucide-react/dist/esm/icons/mouse-pointer-click.js:
lucide-react/dist/esm/icons/pen-line.js:
lucide-react/dist/esm/icons/pin.js:
lucide-react/dist/esm/icons/redo-2.js:
lucide-react/dist/esm/icons/scissors.js:
lucide-react/dist/esm/icons/scroll-text.js:
lucide-react/dist/esm/icons/search.js:
lucide-react/dist/esm/icons/shield-check.js:
lucide-react/dist/esm/icons/sparkles.js:
lucide-react/dist/esm/icons/square.js:
lucide-react/dist/esm/icons/sun-dim.js:
lucide-react/dist/esm/icons/trash-2.js:
lucide-react/dist/esm/icons/type.js:
lucide-react/dist/esm/icons/undo-2.js:
lucide-react/dist/esm/icons/video.js:
lucide-react/dist/esm/icons/x.js:
lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.475.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
