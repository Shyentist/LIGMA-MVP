
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    // Adapted from https://github.com/then/is-promise/blob/master/index.js
    // Distributed under MIT License https://github.com/then/is-promise/blob/master/LICENSE
    function is_promise(value) {
        return !!value && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function';
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        if (value === null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * Creates an event dispatcher that can be used to dispatch [component events](/docs#template-syntax-component-directives-on-eventname).
     * Event dispatchers are functions that can take two arguments: `name` and `detail`.
     *
     * Component events created with `createEventDispatcher` create a
     * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
     * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
     * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
     * property and can contain any type of data.
     *
     * https://svelte.dev/docs#run-time-svelte-createeventdispatcher
     */
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail, { cancelable = false } = {}) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail, { cancelable });
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
                return !event.defaultPrevented;
            }
            return true;
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }

    function handle_promise(promise, info) {
        const token = info.token = {};
        function update(type, index, key, value) {
            if (info.token !== token)
                return;
            info.resolved = value;
            let child_ctx = info.ctx;
            if (key !== undefined) {
                child_ctx = child_ctx.slice();
                child_ctx[key] = value;
            }
            const block = type && (info.current = type)(child_ctx);
            let needs_flush = false;
            if (info.block) {
                if (info.blocks) {
                    info.blocks.forEach((block, i) => {
                        if (i !== index && block) {
                            group_outros();
                            transition_out(block, 1, 1, () => {
                                if (info.blocks[i] === block) {
                                    info.blocks[i] = null;
                                }
                            });
                            check_outros();
                        }
                    });
                }
                else {
                    info.block.d(1);
                }
                block.c();
                transition_in(block, 1);
                block.m(info.mount(), info.anchor);
                needs_flush = true;
            }
            info.block = block;
            if (info.blocks)
                info.blocks[index] = block;
            if (needs_flush) {
                flush();
            }
        }
        if (is_promise(promise)) {
            const current_component = get_current_component();
            promise.then(value => {
                set_current_component(current_component);
                update(info.then, 1, info.value, value);
                set_current_component(null);
            }, error => {
                set_current_component(current_component);
                update(info.catch, 2, info.error, error);
                set_current_component(null);
                if (!info.hasCatch) {
                    throw error;
                }
            });
            // if we previously had a then/catch block, destroy it
            if (info.current !== info.pending) {
                update(info.pending, 0);
                return true;
            }
        }
        else {
            if (info.current !== info.then) {
                update(info.then, 1, info.value, promise);
                return true;
            }
            info.resolved = promise;
        }
    }
    function update_await_block_branch(info, ctx, dirty) {
        const child_ctx = ctx.slice();
        const { resolved } = info;
        if (info.current === info.then) {
            child_ctx[info.value] = resolved;
        }
        if (info.current === info.catch) {
            child_ctx[info.error] = resolved;
        }
        info.block.p(child_ctx, dirty);
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.55.1' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src\shared\Tabs.svelte generated by Svelte v3.55.1 */
    const file$5 = "src\\shared\\Tabs.svelte";

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    function get_each_context_1$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i];
    	return child_ctx;
    }

    // (15:16) { #each group.tabs as tab}
    function create_each_block_1$2(ctx) {
    	let li;
    	let t_value = /*tab*/ ctx[7] + "";
    	let t;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[3](/*group*/ ctx[4], /*tab*/ ctx[7]);
    	}

    	const block = {
    		c: function create() {
    			li = element("li");
    			t = text(t_value);
    			attr_dev(li, "class", "svelte-1nizizj");
    			add_location(li, file$5, 15, 20, 473);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, t);

    			if (!mounted) {
    				dispose = listen_dev(li, "click", click_handler, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*groups*/ 1 && t_value !== (t_value = /*tab*/ ctx[7] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1$2.name,
    		type: "each",
    		source: "(15:16) { #each group.tabs as tab}",
    		ctx
    	});

    	return block;
    }

    // (11:8) { #each groups as group }
    function create_each_block$3(ctx) {
    	let div;
    	let li;
    	let t0_value = /*group*/ ctx[4].name + "";
    	let t0;
    	let t1;
    	let ul;
    	let t2;
    	let each_value_1 = /*group*/ ctx[4].tabs;
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$2(get_each_context_1$2(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			li = element("li");
    			t0 = text(t0_value);
    			t1 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			attr_dev(li, "class", "svelte-1nizizj");
    			toggle_class(li, "active", /*activeGroup*/ ctx[1] === /*group*/ ctx[4].name);
    			add_location(li, file$5, 12, 16, 295);
    			attr_dev(ul, "class", "dropdown-content svelte-1nizizj");
    			add_location(ul, file$5, 13, 16, 378);
    			attr_dev(div, "class", "dropdown svelte-1nizizj");
    			add_location(div, file$5, 11, 12, 254);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, li);
    			append_dev(li, t0);
    			append_dev(div, t1);
    			append_dev(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			append_dev(div, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*groups*/ 1 && t0_value !== (t0_value = /*group*/ ctx[4].name + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*activeGroup, groups*/ 3) {
    				toggle_class(li, "active", /*activeGroup*/ ctx[1] === /*group*/ ctx[4].name);
    			}

    			if (dirty & /*dispatch, groups*/ 5) {
    				each_value_1 = /*group*/ ctx[4].tabs;
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$2(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(11:8) { #each groups as group }",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let div;
    	let ul;
    	let each_value = /*groups*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(ul, "class", "svelte-1nizizj");
    			add_location(ul, file$5, 9, 4, 201);
    			attr_dev(div, "class", "tabs");
    			add_location(div, file$5, 8, 0, 177);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*groups, dispatch, activeGroup*/ 7) {
    				each_value = /*groups*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Tabs', slots, []);
    	const dispatch = createEventDispatcher();
    	let { groups } = $$props;
    	let { activeGroup } = $$props;

    	$$self.$$.on_mount.push(function () {
    		if (groups === undefined && !('groups' in $$props || $$self.$$.bound[$$self.$$.props['groups']])) {
    			console.warn("<Tabs> was created without expected prop 'groups'");
    		}

    		if (activeGroup === undefined && !('activeGroup' in $$props || $$self.$$.bound[$$self.$$.props['activeGroup']])) {
    			console.warn("<Tabs> was created without expected prop 'activeGroup'");
    		}
    	});

    	const writable_props = ['groups', 'activeGroup'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Tabs> was created with unknown prop '${key}'`);
    	});

    	const click_handler = (group, tab) => dispatch('tabChange', { group: group.name, tab });

    	$$self.$$set = $$props => {
    		if ('groups' in $$props) $$invalidate(0, groups = $$props.groups);
    		if ('activeGroup' in $$props) $$invalidate(1, activeGroup = $$props.activeGroup);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		dispatch,
    		groups,
    		activeGroup
    	});

    	$$self.$inject_state = $$props => {
    		if ('groups' in $$props) $$invalidate(0, groups = $$props.groups);
    		if ('activeGroup' in $$props) $$invalidate(1, activeGroup = $$props.activeGroup);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [groups, activeGroup, dispatch, click_handler];
    }

    class Tabs extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { groups: 0, activeGroup: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Tabs",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get groups() {
    		throw new Error("<Tabs>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set groups(value) {
    		throw new Error("<Tabs>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get activeGroup() {
    		throw new Error("<Tabs>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set activeGroup(value) {
    		throw new Error("<Tabs>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const filterData = async (data, filterKey) => {

        data = await data;

        let newData = [];

        if (filterKey !== []){

          data.forEach((entry) => {
            const array = Object.values(entry);

            let match = [];
          
            array.forEach((element) => {
              if (element){
                if (typeof element !== "string") {
                  element = element.toString();
                }
                match.push(element.includes(filterKey));
              } 
            });

          if (match.includes(true)){
            newData.push(entry);
          }
        });
      }

        data = newData;

        return data
      };

    const clearInputsById = (id) => {
      let inputs = document.getElementById(id).getElementsByTagName("input");

      for (let i=0; i < inputs.length; i++){
        inputs[i].value = "";
      }
    };

    const grabInputsByParentId = (id) => {
      let inputsArray = document.getElementById(id).getElementsByTagName("input");

      let selectsArray = document.getElementById(id).getElementsByTagName("select");
          
      let inputsObject = {};

        for (let i=0; i < inputsArray.length; i++){
          let input = inputsArray[i];
            
          inputsObject[input.name] = input.value;
        
        }

        for (let i=0; i < selectsArray.length; i++){
          let option = selectsArray[i];

          inputsObject[option.name] = option.value;

        }

      return inputsObject;
    };

    const isFieldFilled = (HTMLelement) => {
      let input = HTMLelement.value.trim();

      return input !== ''
    };

    const areAllFieldsFilled = (HTMLelementsArray) => {

      let missingInputs = [];

      HTMLelementsArray.forEach((input) => {
        if (!isFieldFilled(input)) {
        //change color of input field to orangered
        input.classList.add("alert");

        missingInputs.push(true);
        } else {
        input.classList.remove("alert");
      }});

      return !missingInputs.includes(true)
    };

    // Unique ID creation requires a high quality random # generator. In the browser we therefore
    // require the crypto API and do not support built-in fallback to lower quality random number
    // generators (like Math.random()).
    let getRandomValues;
    const rnds8 = new Uint8Array(16);
    function rng() {
      // lazy load so that environments that need to polyfill have a chance to do so
      if (!getRandomValues) {
        // getRandomValues needs to be invoked in a context where "this" is a Crypto implementation.
        getRandomValues = typeof crypto !== 'undefined' && crypto.getRandomValues && crypto.getRandomValues.bind(crypto);

        if (!getRandomValues) {
          throw new Error('crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported');
        }
      }

      return getRandomValues(rnds8);
    }

    /**
     * Convert array of 16 byte values to UUID string format of the form:
     * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
     */

    const byteToHex = [];

    for (let i = 0; i < 256; ++i) {
      byteToHex.push((i + 0x100).toString(16).slice(1));
    }

    function unsafeStringify(arr, offset = 0) {
      // Note: Be careful editing this code!  It's been tuned for performance
      // and works in ways you may not expect. See https://github.com/uuidjs/uuid/pull/434
      return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + '-' + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + '-' + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + '-' + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + '-' + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
    }

    const randomUUID = typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID.bind(crypto);
    var native = {
      randomUUID
    };

    function v4(options, buf, offset) {
      if (native.randomUUID && !buf && !options) {
        return native.randomUUID();
      }

      options = options || {};
      const rnds = options.random || (options.rng || rng)(); // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`

      rnds[6] = rnds[6] & 0x0f | 0x40;
      rnds[8] = rnds[8] & 0x3f | 0x80; // Copy bytes to buffer, if provided

      if (buf) {
        offset = offset || 0;

        for (let i = 0; i < 16; ++i) {
          buf[offset + i] = rnds[i];
        }

        return buf;
      }

      return unsafeStringify(rnds);
    }

    /* src\components\TableAddRow.svelte generated by Svelte v3.55.1 */

    const { Object: Object_1 } = globals;
    const file$4 = "src\\components\\TableAddRow.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i];
    	return child_ctx;
    }

    // (23:39) 
    function create_if_block_2$2(ctx) {
    	let td;
    	let label;
    	let t0_value = /*key*/ ctx[4] + "";
    	let t0;
    	let label_for_value;
    	let t1;
    	let input;
    	let input_name_value;
    	let t2;

    	const block = {
    		c: function create() {
    			td = element("td");
    			label = element("label");
    			t0 = text(t0_value);
    			t1 = space();
    			input = element("input");
    			t2 = space();
    			attr_dev(label, "for", label_for_value = /*key*/ ctx[4]);
    			add_location(label, file$4, 24, 4, 730);
    			attr_dev(input, "type", "text");
    			attr_dev(input, "name", input_name_value = /*key*/ ctx[4]);
    			attr_dev(input, "placeholder", "");
    			add_location(input, file$4, 25, 4, 766);
    			attr_dev(td, "class", "form-field");
    			add_location(td, file$4, 23, 0, 701);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, td, anchor);
    			append_dev(td, label);
    			append_dev(label, t0);
    			append_dev(td, t1);
    			append_dev(td, input);
    			append_dev(td, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*entry*/ 1 && t0_value !== (t0_value = /*key*/ ctx[4] + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*entry*/ 1 && label_for_value !== (label_for_value = /*key*/ ctx[4])) {
    				attr_dev(label, "for", label_for_value);
    			}

    			if (dirty & /*entry*/ 1 && input_name_value !== (input_name_value = /*key*/ ctx[4])) {
    				attr_dev(input, "name", input_name_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(td);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$2.name,
    		type: "if",
    		source: "(23:39) ",
    		ctx
    	});

    	return block;
    }

    // (14:92) 
    function create_if_block_1$2(ctx) {
    	let td;
    	let label;
    	let t0_value = /*key*/ ctx[4] + "";
    	let t0;
    	let label_for_value;
    	let t1;
    	let select;
    	let select_name_value;
    	let t2;
    	let each_value_1 = /*selectableInputObjects*/ ctx[3][/*key*/ ctx[4]];
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			td = element("td");
    			label = element("label");
    			t0 = text(t0_value);
    			t1 = space();
    			select = element("select");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			attr_dev(label, "for", label_for_value = /*key*/ ctx[4]);
    			add_location(label, file$4, 15, 4, 458);
    			attr_dev(select, "name", select_name_value = /*key*/ ctx[4]);
    			add_location(select, file$4, 16, 4, 494);
    			attr_dev(td, "class", "form-field");
    			add_location(td, file$4, 14, 0, 429);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, td, anchor);
    			append_dev(td, label);
    			append_dev(label, t0);
    			append_dev(td, t1);
    			append_dev(td, select);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			append_dev(td, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*entry*/ 1 && t0_value !== (t0_value = /*key*/ ctx[4] + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*entry*/ 1 && label_for_value !== (label_for_value = /*key*/ ctx[4])) {
    				attr_dev(label, "for", label_for_value);
    			}

    			if (dirty & /*selectableInputObjects, entry*/ 9) {
    				each_value_1 = /*selectableInputObjects*/ ctx[3][/*key*/ ctx[4]];
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (dirty & /*entry*/ 1 && select_name_value !== (select_name_value = /*key*/ ctx[4])) {
    				attr_dev(select, "name", select_name_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(td);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(14:92) ",
    		ctx
    	});

    	return block;
    }

    // (9:0) {#if disabledInputs.includes(key)}
    function create_if_block$3(ctx) {
    	let td;
    	let label;
    	let t0_value = /*key*/ ctx[4] + "";
    	let t0;
    	let label_for_value;
    	let t1;
    	let input;
    	let input_name_value;
    	let t2;

    	const block = {
    		c: function create() {
    			td = element("td");
    			label = element("label");
    			t0 = text(t0_value);
    			t1 = space();
    			input = element("input");
    			t2 = space();
    			attr_dev(label, "for", label_for_value = /*key*/ ctx[4]);
    			add_location(label, file$4, 10, 4, 236);
    			attr_dev(input, "type", "text");
    			attr_dev(input, "name", input_name_value = /*key*/ ctx[4]);
    			attr_dev(input, "placeholder", "");
    			input.disabled = true;
    			add_location(input, file$4, 11, 4, 272);
    			attr_dev(td, "class", "form-field");
    			add_location(td, file$4, 9, 0, 207);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, td, anchor);
    			append_dev(td, label);
    			append_dev(label, t0);
    			append_dev(td, t1);
    			append_dev(td, input);
    			append_dev(td, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*entry*/ 1 && t0_value !== (t0_value = /*key*/ ctx[4] + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*entry*/ 1 && label_for_value !== (label_for_value = /*key*/ ctx[4])) {
    				attr_dev(label, "for", label_for_value);
    			}

    			if (dirty & /*entry*/ 1 && input_name_value !== (input_name_value = /*key*/ ctx[4])) {
    				attr_dev(input, "name", input_name_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(td);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(9:0) {#if disabledInputs.includes(key)}",
    		ctx
    	});

    	return block;
    }

    // (18:8) {#each selectableInputObjects[key] as value}
    function create_each_block_1$1(ctx) {
    	let option;
    	let t_value = /*value*/ ctx[7] + "";
    	let t;
    	let option_value_value;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = option_value_value = /*value*/ ctx[7];
    			option.value = option.__value;
    			add_location(option, file$4, 18, 12, 581);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*selectableInputObjects, entry*/ 9 && t_value !== (t_value = /*value*/ ctx[7] + "")) set_data_dev(t, t_value);

    			if (dirty & /*selectableInputObjects, entry*/ 9 && option_value_value !== (option_value_value = /*value*/ ctx[7])) {
    				prop_dev(option, "__value", option_value_value);
    				option.value = option.__value;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1$1.name,
    		type: "each",
    		source: "(18:8) {#each selectableInputObjects[key] as value}",
    		ctx
    	});

    	return block;
    }

    // (8:0) {#each entry as key}
    function create_each_block$2(ctx) {
    	let show_if;
    	let show_if_1;
    	let show_if_2;
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (dirty & /*disabledInputs, entry*/ 3) show_if = null;
    		if (dirty & /*ignoredInputs, entry, selectableInputObjects*/ 13) show_if_1 = null;
    		if (dirty & /*ignoredInputs, entry*/ 5) show_if_2 = null;
    		if (show_if == null) show_if = !!/*disabledInputs*/ ctx[1].includes(/*key*/ ctx[4]);
    		if (show_if) return create_if_block$3;
    		if (show_if_1 == null) show_if_1 = !!(!/*ignoredInputs*/ ctx[2].includes(/*key*/ ctx[4]) && Object.keys(/*selectableInputObjects*/ ctx[3]).includes(/*key*/ ctx[4]));
    		if (show_if_1) return create_if_block_1$2;
    		if (show_if_2 == null) show_if_2 = !!!/*ignoredInputs*/ ctx[2].includes(/*key*/ ctx[4]);
    		if (show_if_2) return create_if_block_2$2;
    	}

    	let current_block_type = select_block_type(ctx, -1);
    	let if_block = current_block_type && current_block_type(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx, dirty)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (if_block) {
    				if_block.d(detaching);
    			}

    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(8:0) {#each entry as key}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let each_1_anchor;
    	let each_value = /*entry*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*entry, disabledInputs, selectableInputObjects, ignoredInputs, Object*/ 15) {
    				each_value = /*entry*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('TableAddRow', slots, []);
    	let { entry } = $$props;
    	let { disabledInputs } = $$props;
    	let { ignoredInputs } = $$props;
    	let { selectableInputObjects } = $$props;

    	$$self.$$.on_mount.push(function () {
    		if (entry === undefined && !('entry' in $$props || $$self.$$.bound[$$self.$$.props['entry']])) {
    			console.warn("<TableAddRow> was created without expected prop 'entry'");
    		}

    		if (disabledInputs === undefined && !('disabledInputs' in $$props || $$self.$$.bound[$$self.$$.props['disabledInputs']])) {
    			console.warn("<TableAddRow> was created without expected prop 'disabledInputs'");
    		}

    		if (ignoredInputs === undefined && !('ignoredInputs' in $$props || $$self.$$.bound[$$self.$$.props['ignoredInputs']])) {
    			console.warn("<TableAddRow> was created without expected prop 'ignoredInputs'");
    		}

    		if (selectableInputObjects === undefined && !('selectableInputObjects' in $$props || $$self.$$.bound[$$self.$$.props['selectableInputObjects']])) {
    			console.warn("<TableAddRow> was created without expected prop 'selectableInputObjects'");
    		}
    	});

    	const writable_props = ['entry', 'disabledInputs', 'ignoredInputs', 'selectableInputObjects'];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<TableAddRow> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('entry' in $$props) $$invalidate(0, entry = $$props.entry);
    		if ('disabledInputs' in $$props) $$invalidate(1, disabledInputs = $$props.disabledInputs);
    		if ('ignoredInputs' in $$props) $$invalidate(2, ignoredInputs = $$props.ignoredInputs);
    		if ('selectableInputObjects' in $$props) $$invalidate(3, selectableInputObjects = $$props.selectableInputObjects);
    	};

    	$$self.$capture_state = () => ({
    		entry,
    		disabledInputs,
    		ignoredInputs,
    		selectableInputObjects
    	});

    	$$self.$inject_state = $$props => {
    		if ('entry' in $$props) $$invalidate(0, entry = $$props.entry);
    		if ('disabledInputs' in $$props) $$invalidate(1, disabledInputs = $$props.disabledInputs);
    		if ('ignoredInputs' in $$props) $$invalidate(2, ignoredInputs = $$props.ignoredInputs);
    		if ('selectableInputObjects' in $$props) $$invalidate(3, selectableInputObjects = $$props.selectableInputObjects);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [entry, disabledInputs, ignoredInputs, selectableInputObjects];
    }

    class TableAddRow extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			entry: 0,
    			disabledInputs: 1,
    			ignoredInputs: 2,
    			selectableInputObjects: 3
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TableAddRow",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get entry() {
    		throw new Error("<TableAddRow>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set entry(value) {
    		throw new Error("<TableAddRow>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabledInputs() {
    		throw new Error("<TableAddRow>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabledInputs(value) {
    		throw new Error("<TableAddRow>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get ignoredInputs() {
    		throw new Error("<TableAddRow>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set ignoredInputs(value) {
    		throw new Error("<TableAddRow>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selectableInputObjects() {
    		throw new Error("<TableAddRow>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selectableInputObjects(value) {
    		throw new Error("<TableAddRow>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\ProductsTable.svelte generated by Svelte v3.55.1 */
    const file$3 = "src\\components\\ProductsTable.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[15] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[18] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[18] = list[i];
    	return child_ctx;
    }

    // (180:4) {:catch error}
    function create_catch_block(ctx) {
    	let p;
    	let t_value = /*error*/ ctx[23].message + "";
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text(t_value);
    			set_style(p, "color", "red");
    			add_location(p, file$3, 180, 5, 5034);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*filteredData*/ 2 && t_value !== (t_value = /*error*/ ctx[23].message + "")) set_data_dev(t, t_value);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_catch_block.name,
    		type: "catch",
    		source: "(180:4) {:catch error}",
    		ctx
    	});

    	return block;
    }

    // (118:36)     <tr class="form" id="add-product">      <TableAddRow disabledInputs={["_id","status"]}
    function create_then_block(ctx) {
    	let tr;
    	let tableaddrow;
    	let t0;
    	let td;
    	let br;
    	let t1;
    	let button;
    	let t3;
    	let hr;
    	let t4;
    	let if_block_anchor;
    	let current;
    	let mounted;
    	let dispose;

    	tableaddrow = new TableAddRow({
    			props: {
    				disabledInputs: ["_id", "status"],
    				ignoredInputs: "__v",
    				entry: /*addRowEntry*/ ctx[3],
    				selectableInputObjects: /*selectableInputObjects*/ ctx[2]
    			},
    			$$inline: true
    		});

    	function select_block_type(ctx, dirty) {
    		if (/*entries*/ ctx[14].length !== 0) return create_if_block$2;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			create_component(tableaddrow.$$.fragment);
    			t0 = space();
    			td = element("td");
    			br = element("br");
    			t1 = space();
    			button = element("button");
    			button.textContent = "Add";
    			t3 = space();
    			hr = element("hr");
    			t4 = space();
    			if_block.c();
    			if_block_anchor = empty();
    			add_location(br, file$3, 121, 8, 2847);
    			attr_dev(button, "type", "button");
    			set_style(button, "width", "100%");
    			attr_dev(button, "class", "svelte-fnt43t");
    			add_location(button, file$3, 122, 8, 2861);
    			attr_dev(td, "class", "form-field svelte-fnt43t");
    			add_location(td, file$3, 120, 4, 2814);
    			attr_dev(tr, "class", "form svelte-fnt43t");
    			attr_dev(tr, "id", "add-product");
    			add_location(tr, file$3, 118, 2, 2630);
    			add_location(hr, file$3, 125, 2, 2998);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			mount_component(tableaddrow, tr, null);
    			append_dev(tr, t0);
    			append_dev(tr, td);
    			append_dev(td, br);
    			append_dev(td, t1);
    			append_dev(td, button);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, hr, anchor);
    			insert_dev(target, t4, anchor);
    			if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler*/ ctx[10], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(tableaddrow.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(tableaddrow.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    			destroy_component(tableaddrow);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(hr);
    			if (detaching) detach_dev(t4);
    			if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_then_block.name,
    		type: "then",
    		source: "(118:36)     <tr class=\\\"form\\\" id=\\\"add-product\\\">      <TableAddRow disabledInputs={[\\\"_id\\\",\\\"status\\\"]}",
    		ctx
    	});

    	return block;
    }

    // (177:2) {:else}
    function create_else_block(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "The table is empty.";
    			add_location(p, file$3, 177, 2, 4972);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(177:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (127:2) {#if entries.length !== 0}
    function create_if_block$2(ctx) {
    	let each_1_anchor;
    	let each_value = /*entries*/ ctx[14];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*filteredData, deleteProduct, editProduct, selectableInputObjects*/ 102) {
    				each_value = /*entries*/ ctx[14];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(127:2) {#if entries.length !== 0}",
    		ctx
    	});

    	return block;
    }

    // (149:12) {#if optionValue !== entry.pieceType}
    function create_if_block_2$1(ctx) {
    	let option;
    	let t_value = /*optionValue*/ ctx[18] + "";
    	let t;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = /*optionValue*/ ctx[18];
    			option.value = option.__value;
    			add_location(option, file$3, 149, 12, 3970);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(149:12) {#if optionValue !== entry.pieceType}",
    		ctx
    	});

    	return block;
    }

    // (148:8) {#each selectableInputObjects["pieceType"] as optionValue}
    function create_each_block_2(ctx) {
    	let if_block_anchor;
    	let if_block = /*optionValue*/ ctx[18] !== /*entry*/ ctx[15].pieceType && create_if_block_2$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (/*optionValue*/ ctx[18] !== /*entry*/ ctx[15].pieceType) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_2$1(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(148:8) {#each selectableInputObjects[\\\"pieceType\\\"] as optionValue}",
    		ctx
    	});

    	return block;
    }

    // (165:12) {#if optionValue !== entry.status}
    function create_if_block_1$1(ctx) {
    	let option;
    	let t_value = /*optionValue*/ ctx[18] + "";
    	let t;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = /*optionValue*/ ctx[18];
    			option.value = option.__value;
    			add_location(option, file$3, 165, 12, 4574);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(165:12) {#if optionValue !== entry.status}",
    		ctx
    	});

    	return block;
    }

    // (164:8) {#each selectableInputObjects["status"] as optionValue}
    function create_each_block_1(ctx) {
    	let if_block_anchor;
    	let if_block = /*optionValue*/ ctx[18] !== /*entry*/ ctx[15].status && create_if_block_1$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (/*optionValue*/ ctx[18] !== /*entry*/ ctx[15].status) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1$1(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(164:8) {#each selectableInputObjects[\\\"status\\\"] as optionValue}",
    		ctx
    	});

    	return block;
    }

    // (128:2) {#each entries as entry}
    function create_each_block$1(ctx) {
    	let tr;
    	let td0;
    	let input0;
    	let input0_placeholder_value;
    	let input0_value_value;
    	let t0;
    	let td1;
    	let input1;
    	let input1_value_value;
    	let t1;
    	let td2;
    	let input2;
    	let input2_value_value;
    	let t2;
    	let td3;
    	let input3;
    	let input3_value_value;
    	let t3;
    	let td4;
    	let input4;
    	let input4_value_value;
    	let t4;
    	let td5;
    	let select0;
    	let option0;
    	let t5_value = /*entry*/ ctx[15].pieceType + "";
    	let t5;
    	let option0_value_value;
    	let t6;
    	let td6;
    	let input5;
    	let input5_value_value;
    	let t7;
    	let td7;
    	let input6;
    	let input6_value_value;
    	let t8;
    	let td8;
    	let select1;
    	let option1;
    	let t9_value = /*entry*/ ctx[15].status + "";
    	let t9;
    	let option1_value_value;
    	let t10;
    	let td9;
    	let button0;
    	let t12;
    	let button1;
    	let t14;
    	let tr_id_value;
    	let mounted;
    	let dispose;
    	let each_value_2 = /*selectableInputObjects*/ ctx[2]["pieceType"];
    	validate_each_argument(each_value_2);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_1[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*selectableInputObjects*/ ctx[2]["status"];
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	function click_handler_1() {
    		return /*click_handler_1*/ ctx[11](/*entry*/ ctx[15]);
    	}

    	function click_handler_2() {
    		return /*click_handler_2*/ ctx[12](/*entry*/ ctx[15]);
    	}

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			input0 = element("input");
    			t0 = space();
    			td1 = element("td");
    			input1 = element("input");
    			t1 = space();
    			td2 = element("td");
    			input2 = element("input");
    			t2 = space();
    			td3 = element("td");
    			input3 = element("input");
    			t3 = space();
    			td4 = element("td");
    			input4 = element("input");
    			t4 = space();
    			td5 = element("td");
    			select0 = element("select");
    			option0 = element("option");
    			t5 = text(t5_value);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t6 = space();
    			td6 = element("td");
    			input5 = element("input");
    			t7 = space();
    			td7 = element("td");
    			input6 = element("input");
    			t8 = space();
    			td8 = element("td");
    			select1 = element("select");
    			option1 = element("option");
    			t9 = text(t9_value);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t10 = space();
    			td9 = element("td");
    			button0 = element("button");
    			button0.textContent = "Edit";
    			t12 = space();
    			button1 = element("button");
    			button1.textContent = "Delete";
    			t14 = space();
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "name", "_id");
    			attr_dev(input0, "placeholder", input0_placeholder_value = /*entry*/ ctx[15]._id);
    			input0.disabled = true;
    			input0.value = input0_value_value = /*entry*/ ctx[15]._id;
    			attr_dev(input0, "class", "svelte-fnt43t");
    			add_location(input0, file$3, 130, 6, 3133);
    			attr_dev(td0, "class", "form-field svelte-fnt43t");
    			add_location(td0, file$3, 129, 4, 3102);
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "name", "name");
    			attr_dev(input1, "placeholder", "");
    			input1.value = input1_value_value = /*entry*/ ctx[15].name;
    			attr_dev(input1, "class", "svelte-fnt43t");
    			add_location(input1, file$3, 133, 6, 3262);
    			attr_dev(td1, "class", "form-field svelte-fnt43t");
    			add_location(td1, file$3, 132, 4, 3231);
    			attr_dev(input2, "type", "text");
    			attr_dev(input2, "name", "manufacturer");
    			attr_dev(input2, "placeholder", "");
    			input2.value = input2_value_value = /*entry*/ ctx[15].manufacturer;
    			attr_dev(input2, "class", "svelte-fnt43t");
    			add_location(input2, file$3, 136, 6, 3375);
    			attr_dev(td2, "class", "form-field svelte-fnt43t");
    			add_location(td2, file$3, 135, 4, 3344);
    			attr_dev(input3, "type", "text");
    			attr_dev(input3, "name", "supplier");
    			attr_dev(input3, "placeholder", "");
    			input3.value = input3_value_value = /*entry*/ ctx[15].supplier;
    			attr_dev(input3, "class", "svelte-fnt43t");
    			add_location(input3, file$3, 139, 6, 3504);
    			attr_dev(td3, "class", "form-field svelte-fnt43t");
    			add_location(td3, file$3, 138, 4, 3473);
    			attr_dev(input4, "type", "number");
    			attr_dev(input4, "name", "pieces");
    			attr_dev(input4, "placeholder", "");
    			input4.value = input4_value_value = /*entry*/ ctx[15].pieces;
    			attr_dev(input4, "class", "svelte-fnt43t");
    			add_location(input4, file$3, 142, 6, 3625);
    			attr_dev(td4, "class", "form-field svelte-fnt43t");
    			add_location(td4, file$3, 141, 4, 3594);
    			option0.__value = option0_value_value = /*entry*/ ctx[15].pieceType;
    			option0.value = option0.__value;
    			add_location(option0, file$3, 146, 8, 3779);
    			attr_dev(select0, "name", "pieceType");
    			attr_dev(select0, "class", "svelte-fnt43t");
    			add_location(select0, file$3, 145, 6, 3744);
    			attr_dev(td5, "class", "form-field svelte-fnt43t");
    			add_location(td5, file$3, 144, 4, 3713);
    			attr_dev(input5, "type", "text");
    			attr_dev(input5, "name", "catalogueNumber");
    			attr_dev(input5, "placeholder", "");
    			input5.value = input5_value_value = /*entry*/ ctx[15].catalogueNumber;
    			attr_dev(input5, "class", "svelte-fnt43t");
    			add_location(input5, file$3, 155, 6, 4119);
    			attr_dev(td6, "class", "form-field svelte-fnt43t");
    			add_location(td6, file$3, 154, 4, 4088);
    			attr_dev(input6, "type", "text");
    			attr_dev(input6, "name", "sds");
    			attr_dev(input6, "placeholder", "");
    			input6.value = input6_value_value = /*entry*/ ctx[15].sds;
    			attr_dev(input6, "class", "svelte-fnt43t");
    			add_location(input6, file$3, 158, 6, 4252);
    			attr_dev(td7, "class", "form-field svelte-fnt43t");
    			add_location(td7, file$3, 157, 4, 4221);
    			option1.__value = option1_value_value = /*entry*/ ctx[15].status;
    			option1.value = option1.__value;
    			add_location(option1, file$3, 162, 8, 4395);
    			attr_dev(select1, "name", "status");
    			attr_dev(select1, "class", "svelte-fnt43t");
    			add_location(select1, file$3, 161, 6, 4363);
    			attr_dev(td8, "class", "form-field svelte-fnt43t");
    			add_location(td8, file$3, 160, 4, 4332);
    			set_style(button0, "width", "40%");
    			attr_dev(button0, "class", "svelte-fnt43t");
    			add_location(button0, file$3, 171, 6, 4721);
    			set_style(button1, "width", "54%");
    			attr_dev(button1, "class", "svelte-fnt43t");
    			add_location(button1, file$3, 172, 6, 4826);
    			attr_dev(td9, "class", "form-field svelte-fnt43t");
    			add_location(td9, file$3, 170, 4, 4690);
    			attr_dev(tr, "class", "form svelte-fnt43t");
    			attr_dev(tr, "id", tr_id_value = /*entry*/ ctx[15]._id);
    			add_location(tr, file$3, 128, 2, 3064);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td0);
    			append_dev(td0, input0);
    			append_dev(tr, t0);
    			append_dev(tr, td1);
    			append_dev(td1, input1);
    			append_dev(tr, t1);
    			append_dev(tr, td2);
    			append_dev(td2, input2);
    			append_dev(tr, t2);
    			append_dev(tr, td3);
    			append_dev(td3, input3);
    			append_dev(tr, t3);
    			append_dev(tr, td4);
    			append_dev(td4, input4);
    			append_dev(tr, t4);
    			append_dev(tr, td5);
    			append_dev(td5, select0);
    			append_dev(select0, option0);
    			append_dev(option0, t5);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(select0, null);
    			}

    			append_dev(tr, t6);
    			append_dev(tr, td6);
    			append_dev(td6, input5);
    			append_dev(tr, t7);
    			append_dev(tr, td7);
    			append_dev(td7, input6);
    			append_dev(tr, t8);
    			append_dev(tr, td8);
    			append_dev(td8, select1);
    			append_dev(select1, option1);
    			append_dev(option1, t9);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select1, null);
    			}

    			append_dev(tr, t10);
    			append_dev(tr, td9);
    			append_dev(td9, button0);
    			append_dev(td9, t12);
    			append_dev(td9, button1);
    			append_dev(tr, t14);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", click_handler_1, false, false, false),
    					listen_dev(button1, "click", click_handler_2, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*filteredData*/ 2 && input0_placeholder_value !== (input0_placeholder_value = /*entry*/ ctx[15]._id)) {
    				attr_dev(input0, "placeholder", input0_placeholder_value);
    			}

    			if (dirty & /*filteredData*/ 2 && input0_value_value !== (input0_value_value = /*entry*/ ctx[15]._id) && input0.value !== input0_value_value) {
    				prop_dev(input0, "value", input0_value_value);
    			}

    			if (dirty & /*filteredData*/ 2 && input1_value_value !== (input1_value_value = /*entry*/ ctx[15].name) && input1.value !== input1_value_value) {
    				prop_dev(input1, "value", input1_value_value);
    			}

    			if (dirty & /*filteredData*/ 2 && input2_value_value !== (input2_value_value = /*entry*/ ctx[15].manufacturer) && input2.value !== input2_value_value) {
    				prop_dev(input2, "value", input2_value_value);
    			}

    			if (dirty & /*filteredData*/ 2 && input3_value_value !== (input3_value_value = /*entry*/ ctx[15].supplier) && input3.value !== input3_value_value) {
    				prop_dev(input3, "value", input3_value_value);
    			}

    			if (dirty & /*filteredData*/ 2 && input4_value_value !== (input4_value_value = /*entry*/ ctx[15].pieces) && input4.value !== input4_value_value) {
    				prop_dev(input4, "value", input4_value_value);
    			}

    			if (dirty & /*filteredData*/ 2 && t5_value !== (t5_value = /*entry*/ ctx[15].pieceType + "")) set_data_dev(t5, t5_value);

    			if (dirty & /*filteredData*/ 2 && option0_value_value !== (option0_value_value = /*entry*/ ctx[15].pieceType)) {
    				prop_dev(option0, "__value", option0_value_value);
    				option0.value = option0.__value;
    			}

    			if (dirty & /*selectableInputObjects, filteredData*/ 6) {
    				each_value_2 = /*selectableInputObjects*/ ctx[2]["pieceType"];
    				validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_2(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(select0, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_2.length;
    			}

    			if (dirty & /*filteredData*/ 2 && input5_value_value !== (input5_value_value = /*entry*/ ctx[15].catalogueNumber) && input5.value !== input5_value_value) {
    				prop_dev(input5, "value", input5_value_value);
    			}

    			if (dirty & /*filteredData*/ 2 && input6_value_value !== (input6_value_value = /*entry*/ ctx[15].sds) && input6.value !== input6_value_value) {
    				prop_dev(input6, "value", input6_value_value);
    			}

    			if (dirty & /*filteredData*/ 2 && t9_value !== (t9_value = /*entry*/ ctx[15].status + "")) set_data_dev(t9, t9_value);

    			if (dirty & /*filteredData*/ 2 && option1_value_value !== (option1_value_value = /*entry*/ ctx[15].status)) {
    				prop_dev(option1, "__value", option1_value_value);
    				option1.value = option1.__value;
    			}

    			if (dirty & /*selectableInputObjects, filteredData*/ 6) {
    				each_value_1 = /*selectableInputObjects*/ ctx[2]["status"];
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (dirty & /*filteredData*/ 2 && tr_id_value !== (tr_id_value = /*entry*/ ctx[15]._id)) {
    				attr_dev(tr, "id", tr_id_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(128:2) {#each entries as entry}",
    		ctx
    	});

    	return block;
    }

    // (1:0) <script>      import { filterData, clearInputsById, grabInputsByParentId, areAllFieldsFilled }
    function create_pending_block(ctx) {
    	const block = {
    		c: noop,
    		m: noop,
    		p: noop,
    		i: noop,
    		o: noop,
    		d: noop
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_pending_block.name,
    		type: "pending",
    		source: "(1:0) <script>      import { filterData, clearInputsById, grabInputsByParentId, areAllFieldsFilled }",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let div0;
    	let h2;
    	let t1;
    	let div1;
    	let table;
    	let thead;
    	let input;
    	let t2;
    	let hr;
    	let t3;
    	let tbody;
    	let promise;
    	let current;
    	let mounted;
    	let dispose;

    	let info = {
    		ctx,
    		current: null,
    		token: null,
    		hasCatch: true,
    		pending: create_pending_block,
    		then: create_then_block,
    		catch: create_catch_block,
    		value: 14,
    		error: 23,
    		blocks: [,,,]
    	};

    	handle_promise(promise = /*filteredData*/ ctx[1], info);

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Products Catalogue";
    			t1 = space();
    			div1 = element("div");
    			table = element("table");
    			thead = element("thead");
    			input = element("input");
    			t2 = space();
    			hr = element("hr");
    			t3 = space();
    			tbody = element("tbody");
    			info.block.c();
    			add_location(h2, file$3, 108, 5, 2382);
    			add_location(div0, file$3, 108, 0, 2377);
    			attr_dev(input, "type", "text");
    			attr_dev(input, "placeholder", "Filter by all");
    			attr_dev(input, "class", "svelte-fnt43t");
    			add_location(input, file$3, 113, 6, 2487);
    			attr_dev(thead, "class", "form svelte-fnt43t");
    			add_location(thead, file$3, 112, 2, 2459);
    			add_location(hr, file$3, 115, 2, 2573);
    			attr_dev(tbody, "class", "svelte-fnt43t");
    			add_location(tbody, file$3, 116, 2, 2581);
    			attr_dev(table, "class", "svelte-fnt43t");
    			add_location(table, file$3, 111, 0, 2448);
    			attr_dev(div1, "class", "table-wrapper svelte-fnt43t");
    			add_location(div1, file$3, 110, 0, 2419);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, h2);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, table);
    			append_dev(table, thead);
    			append_dev(thead, input);
    			set_input_value(input, /*filterKey*/ ctx[0]);
    			append_dev(table, t2);
    			append_dev(table, hr);
    			append_dev(table, t3);
    			append_dev(table, tbody);
    			info.block.m(tbody, info.anchor = null);
    			info.mount = () => tbody;
    			info.anchor = null;
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(input, "input", /*input_input_handler*/ ctx[9]);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (dirty & /*filterKey*/ 1 && input.value !== /*filterKey*/ ctx[0]) {
    				set_input_value(input, /*filterKey*/ ctx[0]);
    			}

    			info.ctx = ctx;

    			if (dirty & /*filteredData*/ 2 && promise !== (promise = /*filteredData*/ ctx[1]) && handle_promise(promise, info)) ; else {
    				update_await_block_branch(info, ctx, dirty);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(info.block);
    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < 3; i += 1) {
    				const block = info.blocks[i];
    				transition_out(block);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div1);
    			info.block.d();
    			info.token = null;
    			info = null;
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let filteredData;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ProductsTable', slots, []);
    	let { updates } = $$props;
    	let { products } = $$props;

    	function generateUuid() {
    		const uuid = v4();
    		return uuid;
    	}

    	let filterKey = "";

    	let selectableInputObjects = {
    		pieceType: ["tips", "syringes", "racks", "gloves", "masks"],
    		status: ["Active", "Inactive"]
    	};

    	let addRowEntry = [
    		"_id",
    		"name",
    		"manufacturer",
    		"supplier",
    		"pieces",
    		"pieceType",
    		"catalogueNumber",
    		"sds",
    		"status"
    	];

    	const addProduct = async id => {
    		let inputName = document.getElementById(id).getElementsByTagName("input")[1];
    		let requiredInputs = [inputName];

    		if (!areAllFieldsFilled(requiredInputs)) {
    			return;
    		}

    		let inputsObject = grabInputsByParentId(id);
    		let uuid = generateUuid();
    		let status = "Active";
    		inputsObject._id = uuid;
    		inputsObject.status = status;
    		products.push(inputsObject);
    		let update = {};
    		update.subject = "Johnson";
    		update.action = "added a Product with _id: ";
    		update.object = inputsObject._id;
    		updates.push(update);
    		$$invalidate(7, products);
    		clearInputsById(id);
    	};

    	const editProduct = async id => {
    		let inputName = document.getElementById(id).getElementsByTagName("input")[1];
    		let requiredInputs = [inputName];

    		if (!areAllFieldsFilled(requiredInputs)) {
    			return;
    		}

    		let inputsObject = grabInputsByParentId(id);

    		$$invalidate(7, products = products.filter(element => {
    			return element._id !== id;
    		}));

    		products.push(inputsObject);
    		let update = {};
    		update.subject = "Johnson";
    		update.action = "edited a Product with _id: ";
    		update.object = id;
    		updates.push(update);
    		$$invalidate(7, products);
    	};

    	const deleteProduct = async id => {
    		$$invalidate(7, products = products.filter(element => {
    			return element._id !== id;
    		}));

    		let update = {};
    		update.subject = "Johnson";
    		update.action = "deleted a Product with _id: ";
    		update.object = id;
    		updates.push(update);
    		$$invalidate(7, products);
    	};

    	$$self.$$.on_mount.push(function () {
    		if (updates === undefined && !('updates' in $$props || $$self.$$.bound[$$self.$$.props['updates']])) {
    			console.warn("<ProductsTable> was created without expected prop 'updates'");
    		}

    		if (products === undefined && !('products' in $$props || $$self.$$.bound[$$self.$$.props['products']])) {
    			console.warn("<ProductsTable> was created without expected prop 'products'");
    		}
    	});

    	const writable_props = ['updates', 'products'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ProductsTable> was created with unknown prop '${key}'`);
    	});

    	function input_input_handler() {
    		filterKey = this.value;
    		$$invalidate(0, filterKey);
    	}

    	const click_handler = async () => {
    		await addProduct("add-product");
    	};

    	const click_handler_1 = async entry => {
    		await editProduct(entry._id);
    	};

    	const click_handler_2 = async entry => {
    		await deleteProduct(entry._id);
    	};

    	$$self.$$set = $$props => {
    		if ('updates' in $$props) $$invalidate(8, updates = $$props.updates);
    		if ('products' in $$props) $$invalidate(7, products = $$props.products);
    	};

    	$$self.$capture_state = () => ({
    		filterData,
    		clearInputsById,
    		grabInputsByParentId,
    		areAllFieldsFilled,
    		uuidv4: v4,
    		updates,
    		products,
    		generateUuid,
    		TableAddRow,
    		filterKey,
    		selectableInputObjects,
    		addRowEntry,
    		addProduct,
    		editProduct,
    		deleteProduct,
    		filteredData
    	});

    	$$self.$inject_state = $$props => {
    		if ('updates' in $$props) $$invalidate(8, updates = $$props.updates);
    		if ('products' in $$props) $$invalidate(7, products = $$props.products);
    		if ('filterKey' in $$props) $$invalidate(0, filterKey = $$props.filterKey);
    		if ('selectableInputObjects' in $$props) $$invalidate(2, selectableInputObjects = $$props.selectableInputObjects);
    		if ('addRowEntry' in $$props) $$invalidate(3, addRowEntry = $$props.addRowEntry);
    		if ('filteredData' in $$props) $$invalidate(1, filteredData = $$props.filteredData);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*products, filterKey*/ 129) {
    			$$invalidate(1, filteredData = filterData(products, filterKey));
    		}
    	};

    	return [
    		filterKey,
    		filteredData,
    		selectableInputObjects,
    		addRowEntry,
    		addProduct,
    		editProduct,
    		deleteProduct,
    		products,
    		updates,
    		input_input_handler,
    		click_handler,
    		click_handler_1,
    		click_handler_2
    	];
    }

    class ProductsTable extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { updates: 8, products: 7 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ProductsTable",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get updates() {
    		throw new Error("<ProductsTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set updates(value) {
    		throw new Error("<ProductsTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get products() {
    		throw new Error("<ProductsTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set products(value) {
    		throw new Error("<ProductsTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Updates.svelte generated by Svelte v3.55.1 */

    const file$2 = "src\\components\\Updates.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[1] = list[i];
    	return child_ctx;
    }

    // (8:4) {#if updates.length !== 0}
    function create_if_block$1(ctx) {
    	let each_1_anchor;
    	let each_value = /*updates*/ ctx[0].slice().reverse();
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*updates*/ 1) {
    				each_value = /*updates*/ ctx[0].slice().reverse();
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(8:4) {#if updates.length !== 0}",
    		ctx
    	});

    	return block;
    }

    // (9:4) {#each updates.slice().reverse() as update}
    function create_each_block(ctx) {
    	let div;
    	let img;
    	let img_src_value;
    	let img_alt_value;
    	let t0;
    	let p;
    	let b;
    	let t1_value = /*update*/ ctx[1].subject + "";
    	let t1;
    	let t2;
    	let t3_value = /*update*/ ctx[1].action + "";
    	let t3;
    	let t4;
    	let t5_value = /*update*/ ctx[1].object + "";
    	let t5;
    	let t6;
    	let t7;

    	const block = {
    		c: function create() {
    			div = element("div");
    			img = element("img");
    			t0 = space();
    			p = element("p");
    			b = element("b");
    			t1 = text(t1_value);
    			t2 = space();
    			t3 = text(t3_value);
    			t4 = space();
    			t5 = text(t5_value);
    			t6 = text(".");
    			t7 = space();
    			if (!src_url_equal(img.src, img_src_value = `./imgs/${/*update*/ ctx[1].subject}.png`)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", img_alt_value = `${/*update*/ ctx[1].subject}'s profile picture`);
    			attr_dev(img, "class", "svelte-v7e5nt");
    			add_location(img, file$2, 10, 8, 240);
    			add_location(b, file$2, 11, 11, 339);
    			attr_dev(p, "class", "svelte-v7e5nt");
    			add_location(p, file$2, 11, 8, 336);
    			attr_dev(div, "class", "update-bubble svelte-v7e5nt");
    			add_location(div, file$2, 9, 4, 203);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, img);
    			append_dev(div, t0);
    			append_dev(div, p);
    			append_dev(p, b);
    			append_dev(b, t1);
    			append_dev(p, t2);
    			append_dev(p, t3);
    			append_dev(p, t4);
    			append_dev(p, t5);
    			append_dev(p, t6);
    			append_dev(div, t7);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*updates*/ 1 && !src_url_equal(img.src, img_src_value = `./imgs/${/*update*/ ctx[1].subject}.png`)) {
    				attr_dev(img, "src", img_src_value);
    			}

    			if (dirty & /*updates*/ 1 && img_alt_value !== (img_alt_value = `${/*update*/ ctx[1].subject}'s profile picture`)) {
    				attr_dev(img, "alt", img_alt_value);
    			}

    			if (dirty & /*updates*/ 1 && t1_value !== (t1_value = /*update*/ ctx[1].subject + "")) set_data_dev(t1, t1_value);
    			if (dirty & /*updates*/ 1 && t3_value !== (t3_value = /*update*/ ctx[1].action + "")) set_data_dev(t3, t3_value);
    			if (dirty & /*updates*/ 1 && t5_value !== (t5_value = /*update*/ ctx[1].object + "")) set_data_dev(t5, t5_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(9:4) {#each updates.slice().reverse() as update}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div0;
    	let h2;
    	let t1;
    	let div2;
    	let t2;
    	let div1;
    	let img;
    	let img_src_value;
    	let t3;
    	let p;
    	let b0;
    	let t5;
    	let b1;
    	let t7;
    	let b2;
    	let t9;
    	let if_block = /*updates*/ ctx[0].length !== 0 && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Updates";
    			t1 = space();
    			div2 = element("div");
    			if (if_block) if_block.c();
    			t2 = space();
    			div1 = element("div");
    			img = element("img");
    			t3 = space();
    			p = element("p");
    			b0 = element("b");
    			b0.textContent = "Pico";
    			t5 = text(" created ");
    			b1 = element("b");
    			b1.textContent = "L I G M A";
    			t7 = text(". More updates will show here after you, as the user ");
    			b2 = element("b");
    			b2.textContent = "Johnson";
    			t9 = text(", have performed some actions.");
    			add_location(h2, file$2, 4, 5, 53);
    			add_location(div0, file$2, 4, 0, 48);
    			if (!src_url_equal(img.src, img_src_value = "./imgs/Pico.png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "Pico's profile picture");
    			attr_dev(img, "class", "svelte-v7e5nt");
    			add_location(img, file$2, 16, 8, 478);
    			add_location(b0, file$2, 17, 11, 551);
    			add_location(b1, file$2, 17, 31, 571);
    			add_location(b2, file$2, 17, 100, 640);
    			attr_dev(p, "class", "svelte-v7e5nt");
    			add_location(p, file$2, 17, 8, 548);
    			attr_dev(div1, "class", "update-bubble svelte-v7e5nt");
    			add_location(div1, file$2, 15, 4, 441);
    			attr_dev(div2, "class", "update-bubble-container");
    			add_location(div2, file$2, 6, 0, 79);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, h2);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div2, anchor);
    			if (if_block) if_block.m(div2, null);
    			append_dev(div2, t2);
    			append_dev(div2, div1);
    			append_dev(div1, img);
    			append_dev(div1, t3);
    			append_dev(div1, p);
    			append_dev(p, b0);
    			append_dev(p, t5);
    			append_dev(p, b1);
    			append_dev(p, t7);
    			append_dev(p, b2);
    			append_dev(p, t9);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*updates*/ ctx[0].length !== 0) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(div2, t2);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div2);
    			if (if_block) if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Updates', slots, []);
    	let { updates } = $$props;

    	$$self.$$.on_mount.push(function () {
    		if (updates === undefined && !('updates' in $$props || $$self.$$.bound[$$self.$$.props['updates']])) {
    			console.warn("<Updates> was created without expected prop 'updates'");
    		}
    	});

    	const writable_props = ['updates'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Updates> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('updates' in $$props) $$invalidate(0, updates = $$props.updates);
    	};

    	$$self.$capture_state = () => ({ updates });

    	$$self.$inject_state = $$props => {
    		if ('updates' in $$props) $$invalidate(0, updates = $$props.updates);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [updates];
    }

    class Updates extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { updates: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Updates",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get updates() {
    		throw new Error("<Updates>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set updates(value) {
    		throw new Error("<Updates>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Profile.svelte generated by Svelte v3.55.1 */

    const file$1 = "src\\components\\Profile.svelte";

    function create_fragment$1(ctx) {
    	let div0;
    	let h2;
    	let t1;
    	let div7;
    	let div5;
    	let div3;
    	let div1;
    	let b0;
    	let t3;
    	let input0;
    	let t4;
    	let div2;
    	let b1;
    	let t6;
    	let input1;
    	let t7;
    	let div4;
    	let b2;
    	let t9;
    	let textarea;
    	let t10;
    	let a;
    	let button;
    	let t12;
    	let div6;
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Profile";
    			t1 = space();
    			div7 = element("div");
    			div5 = element("div");
    			div3 = element("div");
    			div1 = element("div");
    			b0 = element("b");
    			b0.textContent = "Name:";
    			t3 = space();
    			input0 = element("input");
    			t4 = space();
    			div2 = element("div");
    			b1 = element("b");
    			b1.textContent = "Surname:";
    			t6 = space();
    			input1 = element("input");
    			t7 = space();
    			div4 = element("div");
    			b2 = element("b");
    			b2.textContent = "Biography:";
    			t9 = space();
    			textarea = element("textarea");
    			t10 = space();
    			a = element("a");
    			button = element("button");
    			button.textContent = "Learn more";
    			t12 = space();
    			div6 = element("div");
    			img = element("img");
    			add_location(h2, file$1, 12, 5, 1491);
    			add_location(div0, file$1, 12, 0, 1486);
    			add_location(b0, file$1, 18, 12, 1649);
    			attr_dev(input0, "type", "text");
    			input0.disabled = true;
    			attr_dev(input0, "placeholder", "Johnson");
    			attr_dev(input0, "class", "svelte-1dy5cwc");
    			add_location(input0, file$1, 19, 12, 1675);
    			attr_dev(div1, "class", "svelte-1dy5cwc");
    			add_location(div1, file$1, 17, 12, 1630);
    			add_location(b1, file$1, 22, 12, 1780);
    			attr_dev(input1, "type", "text");
    			input1.disabled = true;
    			attr_dev(input1, "placeholder", "The Poison Dart Frog");
    			attr_dev(input1, "class", "svelte-1dy5cwc");
    			add_location(input1, file$1, 23, 12, 1809);
    			attr_dev(div2, "class", "svelte-1dy5cwc");
    			add_location(div2, file$1, 21, 12, 1761);
    			attr_dev(div3, "class", "name-and-surname svelte-1dy5cwc");
    			add_location(div3, file$1, 16, 8, 1586);
    			add_location(b2, file$1, 27, 12, 1957);
    			attr_dev(textarea, "rows", "10");
    			set_style(textarea, "width", "100%");
    			textarea.disabled = true;
    			textarea.value = /*biography*/ ctx[0];
    			add_location(textarea, file$1, 28, 12, 1988);
    			add_location(button, file$1, 29, 68, 2129);
    			attr_dev(a, "href", url);
    			attr_dev(a, "target", "_blank");
    			attr_dev(a, "rel", "noreferrer noopener");
    			add_location(a, file$1, 29, 12, 2073);
    			attr_dev(div4, "class", "biography svelte-1dy5cwc");
    			add_location(div4, file$1, 26, 8, 1920);
    			attr_dev(div5, "class", "profile-info svelte-1dy5cwc");
    			add_location(div5, file$1, 15, 4, 1550);
    			if (!src_url_equal(img.src, img_src_value = "./imgs/Johnson.png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "Johnson's profile picture");
    			attr_dev(img, "class", "svelte-1dy5cwc");
    			add_location(img, file$1, 33, 8, 2233);
    			attr_dev(div6, "class", "profile-picture svelte-1dy5cwc");
    			add_location(div6, file$1, 32, 4, 2194);
    			attr_dev(div7, "class", "profile-sheet svelte-1dy5cwc");
    			add_location(div7, file$1, 14, 0, 1517);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, h2);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div7, anchor);
    			append_dev(div7, div5);
    			append_dev(div5, div3);
    			append_dev(div3, div1);
    			append_dev(div1, b0);
    			append_dev(div1, t3);
    			append_dev(div1, input0);
    			append_dev(div3, t4);
    			append_dev(div3, div2);
    			append_dev(div2, b1);
    			append_dev(div2, t6);
    			append_dev(div2, input1);
    			append_dev(div5, t7);
    			append_dev(div5, div4);
    			append_dev(div4, b2);
    			append_dev(div4, t9);
    			append_dev(div4, textarea);
    			append_dev(div4, t10);
    			append_dev(div4, a);
    			append_dev(a, button);
    			append_dev(div7, t12);
    			append_dev(div7, div6);
    			append_dev(div6, img);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div7);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const url = "https://www.eol.org/pages/1554";

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Profile', slots, []);

    	const biography = `I am a poison dart frog. My family and I are endemic to humid, tropical environments of Central and South America, mostly from their tropical rainforests. 

They call us "poison dart frogs" due to the Native Americans' use of our toxic secretions to poison the tips of their blowdarts. However, out of over 170 species, only four, larger in size and with higher levels of toxicity, have been documented as being used for this purpose. The most poisonous of us have enough toxin on average to kill ten to twenty men or about twenty thousand mice. Still, we are also making progresses in medicine. In fact, some chemicals extracted from the skin of some of us may have medicinal value, mostly as muscle relaxants, heart stimulants, and appetite suppressants. One such chemical is a painkiller 200 times as potent as morphine, called epibatidine...however, the therapeutic dose is very close to the fatal dose!

I am one of those species who actually produce very little, if any, toxins, but still retains the flamboyant skin colors to tell people to bug off and respect our personal space, so you can lick me safely...kinda.

Some of us, like me, had to leave their native land because of the rampant habitat loss, while some others were caught, sold, and deported as pets, so it is no surprise that some species of poison dart frogs are listed as threatened or endangered as a result.`;

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Profile> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ biography, url });
    	return [biography];
    }

    class Profile extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Profile",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src\App.svelte generated by Svelte v3.55.1 */
    const file = "src\\App.svelte";

    // (63:35) 
    function create_if_block_2(ctx) {
    	let profile;
    	let current;
    	profile = new Profile({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(profile.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(profile, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(profile.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(profile.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(profile, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(63:35) ",
    		ctx
    	});

    	return block;
    }

    // (61:35) 
    function create_if_block_1(ctx) {
    	let updates_1;
    	let current;

    	updates_1 = new Updates({
    			props: { updates: /*updates*/ ctx[3] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(updates_1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(updates_1, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const updates_1_changes = {};
    			if (dirty & /*updates*/ 8) updates_1_changes.updates = /*updates*/ ctx[3];
    			updates_1.$set(updates_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(updates_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(updates_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(updates_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(61:35) ",
    		ctx
    	});

    	return block;
    }

    // (59:1) {#if activeTab === "Products"}
    function create_if_block(ctx) {
    	let productstable;
    	let updating_updates;
    	let updating_products;
    	let current;

    	function productstable_updates_binding(value) {
    		/*productstable_updates_binding*/ ctx[6](value);
    	}

    	function productstable_products_binding(value) {
    		/*productstable_products_binding*/ ctx[7](value);
    	}

    	let productstable_props = {};

    	if (/*updates*/ ctx[3] !== void 0) {
    		productstable_props.updates = /*updates*/ ctx[3];
    	}

    	if (/*products*/ ctx[2] !== void 0) {
    		productstable_props.products = /*products*/ ctx[2];
    	}

    	productstable = new ProductsTable({
    			props: productstable_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(productstable, 'updates', productstable_updates_binding));
    	binding_callbacks.push(() => bind(productstable, 'products', productstable_products_binding));

    	const block = {
    		c: function create() {
    			create_component(productstable.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(productstable, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const productstable_changes = {};

    			if (!updating_updates && dirty & /*updates*/ 8) {
    				updating_updates = true;
    				productstable_changes.updates = /*updates*/ ctx[3];
    				add_flush_callback(() => updating_updates = false);
    			}

    			if (!updating_products && dirty & /*products*/ 4) {
    				updating_products = true;
    				productstable_changes.products = /*products*/ ctx[2];
    				add_flush_callback(() => updating_products = false);
    			}

    			productstable.$set(productstable_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(productstable.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(productstable.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(productstable, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(59:1) {#if activeTab === \\\"Products\\\"}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let main;
    	let div;
    	let h1;
    	let t0;
    	let img;
    	let img_src_value;
    	let t1;
    	let tabs;
    	let t2;
    	let current_block_type_index;
    	let if_block;
    	let current;

    	tabs = new Tabs({
    			props: {
    				activeGroup: /*activeGroup*/ ctx[0],
    				groups: /*groups*/ ctx[4]
    			},
    			$$inline: true
    		});

    	tabs.$on("tabChange", /*tabChange*/ ctx[5]);
    	const if_block_creators = [create_if_block, create_if_block_1, create_if_block_2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*activeTab*/ ctx[1] === "Products") return 0;
    		if (/*activeTab*/ ctx[1] === "Updates") return 1;
    		if (/*activeTab*/ ctx[1] === "Profile") return 2;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	const block = {
    		c: function create() {
    			main = element("main");
    			div = element("div");
    			h1 = element("h1");
    			t0 = text("L I G M A ");
    			img = element("img");
    			t1 = space();
    			create_component(tabs.$$.fragment);
    			t2 = space();
    			if (if_block) if_block.c();
    			if (!src_url_equal(img.src, img_src_value = "./imgs/logo.png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "Johnson, the frog");
    			set_style(img, "width", "40px");
    			add_location(img, file, 55, 16, 1296);
    			add_location(h1, file, 55, 2, 1282);
    			add_location(div, file, 54, 1, 1273);
    			attr_dev(main, "class", "svelte-eqrhlg");
    			add_location(main, file, 53, 0, 1264);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, div);
    			append_dev(div, h1);
    			append_dev(h1, t0);
    			append_dev(h1, img);
    			append_dev(main, t1);
    			mount_component(tabs, main, null);
    			append_dev(main, t2);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(main, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const tabs_changes = {};
    			if (dirty & /*activeGroup*/ 1) tabs_changes.activeGroup = /*activeGroup*/ ctx[0];
    			tabs.$set(tabs_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					} else {
    						if_block.p(ctx, dirty);
    					}

    					transition_in(if_block, 1);
    					if_block.m(main, null);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(tabs.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(tabs.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_component(tabs);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);

    	let groups = [
    		{
    			name: "Home",
    			tabs: ["Profile", "Updates"]
    		},
    		{ name: "Warehouse", tabs: ["Products"] }
    	];

    	let activeGroup = "Home";
    	let activeTab = "Updates";

    	let products = [
    		{
    			"_id": "DHv3zsZglAYSOid",
    			"name": "Syringes",
    			"manufacturer": "",
    			"supplier": "Qosina",
    			"pieces": 1200,
    			"pieceType": "syringes",
    			"catalogueNumber": "",
    			"sds": "",
    			"status": "Active",
    			"__v": 0
    		},
    		{
    			"_id": "LDb6zsSclZWSOid",
    			"name": "1ml filter tips",
    			"manufacturer": "Eppendorf",
    			"supplier": "EJ Busuttil",
    			"pieces": null,
    			"pieceType": "tips",
    			"catalogueNumber": "A050931",
    			"sds": "",
    			"status": "Active",
    			"__v": 0
    		},
    		{
    			"_id": "ALv2zsSclAWZOid",
    			"name": "Nitrile Gloves XL",
    			"manufacturer": "INTCO",
    			"supplier": "Medik Malta",
    			"pieces": 50,
    			"pieceType": "gloves",
    			"catalogueNumber": "G000008",
    			"sds": "",
    			"status": "Active",
    			"__v": 0
    		}
    	];

    	let updates = [];

    	const tabChange = e => {
    		$$invalidate(0, activeGroup = e.detail.group);
    		$$invalidate(1, activeTab = e.detail.tab);
    	};

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function productstable_updates_binding(value) {
    		updates = value;
    		$$invalidate(3, updates);
    	}

    	function productstable_products_binding(value) {
    		products = value;
    		$$invalidate(2, products);
    	}

    	$$self.$capture_state = () => ({
    		Tabs,
    		ProductsTable,
    		Updates,
    		Profile,
    		groups,
    		activeGroup,
    		activeTab,
    		products,
    		updates,
    		tabChange
    	});

    	$$self.$inject_state = $$props => {
    		if ('groups' in $$props) $$invalidate(4, groups = $$props.groups);
    		if ('activeGroup' in $$props) $$invalidate(0, activeGroup = $$props.activeGroup);
    		if ('activeTab' in $$props) $$invalidate(1, activeTab = $$props.activeTab);
    		if ('products' in $$props) $$invalidate(2, products = $$props.products);
    		if ('updates' in $$props) $$invalidate(3, updates = $$props.updates);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		activeGroup,
    		activeTab,
    		products,
    		updates,
    		groups,
    		tabChange,
    		productstable_updates_binding,
    		productstable_products_binding
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    	}
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
