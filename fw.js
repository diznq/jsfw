/**
 * Main framework instance, private methods begin with underscore
 */
class FW {
    /**
     * Create new framework instance
     */
    constructor(){
        this.observers = {}
        this.varmatch = /\{\{(.+?)\}\}/g;
    }

    /**
     * Create state
     * @param {{[key: string]: any}} state 
     * @param {?string} parentPath
     * @returns {{[key: string]: any}>
     */
    addState(state, parentPath){
        parentPath = parentPath || ""
        if(parentPath.startsWith(".")) parentPath = parentPath.substring(1)
        const self = this
        // Check for nested objects
        for (const key in state) {
            if (Object.hasOwnProperty.call(state, key)) {
                const element = state[key];
                // If state contains object, wrap it into proxy as well, but with different parent path already
                if(typeof(element) == "object"){
                    state[key] = this.addState(element, parentPath + "." + key)
                }
            }
        }
        return new Proxy(state, {
            set(target, key, value){
                let path = parentPath + "." + key
                if(path.startsWith(".")) path = path.substring(1)
                
                function pushUpdate(obj, ppath){
                    if(ppath.startsWith(".")) ppath = ppath.substring(1)
                    const updatable = [ppath]
                    if(typeof(obj) != "object" || obj == null) return updatable
                    if(typeof(obj.length) == "number") updatable.push(ppath + ".length")
                    for (const key in obj) {
                        if (Object.hasOwnProperty.call(obj, key)) {
                            const element = obj[key];
                            updatable.push(... pushUpdate(element, ppath + "." + key))
                        }
                    }
                    return updatable
                }

                const pools = pushUpdate(value, path)
                
                // In case we set new object, make it proxy as well
                if(typeof(value) == "object" && value != null){
                    value = self.addState(value, path)
                }

                target[key] = value
                pools.forEach(pool => (self.observers[pool] || []).forEach(async(listener) => {
                    try {
                        let result = listener()
                        if(typeof(result) == "object" && typeof(result.then) == "function"){
                            await result
                        }
                    } catch(ex){
                        console.error("Listener for " + pool + " failed with: ", ex)
                    }
                }))
                return true;
            }
        })
    }

    /**
     * Add observer for given state key
     * @param {!string} key state key to observe, for arrays, instead of using [n], use .n, i.e. (messages.0.text => messages[0].text)
     * @param {!(() => void)} callback listener that's called when value changes
     * @param {?boolean} run true if callback to be run immediately after this call
     */
    observe(key, callback, run){
        run = run || false
        this.observers[key] = this.observers[key] || []
        this.observers[key].push(callback)
        if(run) callback()
        return {
            key,
            remove: () => {
                this.observers[key] = this.observers[key].map(fn => fn != callback)
            }
        }
    }

    /**
     * _remap state variable given the context
     * @param {string} key 
     * @param {{[key: string]: string}} mapping 
     */
    _remap(state, key, mapping){
        for (const k in mapping) {
            if (Object.hasOwnProperty.call(mapping, k)) {
                const element = mapping[k];
                if(key.startsWith(k)){
                    return key.replace(k, element)
                }
            }
        }
        return key
    }

    /**
     * Get variable from state
     * @param {!{[key: string]: any}} state 
     * @param {!string} path 
     * @returns {any}
     */
    get(state, path, mapping){
        path = this._remap(state, path, mapping)
        const parts = path.split(".")
        let obj = state
        let end = parts.pop()
        while(parts.length > 0 && typeof(obj) != "undefined") obj=obj[parts.shift()]
        if(typeof(obj) == "object" && !obj) return null
        else if(typeof(obj) == "undefined") return null
        return obj[end]
    }

    /**
     * Execute string as a code given the state
     * @param {!{[key: string]: any}} state current state
     * @param {!string} code code to be executed
     * @param {!{[key: string]: string}} mapping context mapping
     * @param {HTMLElement} self used as this inside code execution 
     * @param {[key: string]: any} params rest of params
     * @returns 
     */
    executeCode(state, code, mapping, self, params) {
        params = params || {}
        const varmatch = this.varmatch
        code = code.replace(varmatch, (_, m) => {
            return "__STATE__." + this._remap(state, m, mapping).replace(/\.(\d+)/g, "[$1]")
        })
        if(code.indexOf("return") == -1) code = `return (${code})`;
        let paramsKeys = ["__STATE__", "self"]
        let paramsValues = [state, this]
        for (const key in params) {
            if (Object.hasOwnProperty.call(params, key)) {
                const element = params[key];
                paramsKeys.push(key)
                paramsValues.push(element)
            }
        }
        const fn = new Function(paramsKeys.join(","), code)
        if(typeof(self) != "undefined") 
            return fn.call(self, ... paramsValues)
        return fn(state, this)
    }

    /**
     * Bootstrap element
     * @param {!{[key: string]: any}} state
     * @param {!HTMLElement} element 
     * @param {?{[key: string]: string}} mapping
     */
    async bootstrap(state, element, mapping) {
        const varmatch = this.varmatch
        element.wd = element.wd || []
        mapping = mapping || {}
        const children = element.querySelectorAll(":scope > *")
        
        // If the element is a conditional, hide it if the condition fails, display it otherwise
        if(element.hasAttribute("if")){
            let isHard = element.hasAttribute("hard")
            let condition = element.getAttribute("if")
            const matches = condition.match(varmatch)
            const evaluate = async () => {
                let res = this.executeCode(state, condition, mapping, element)
                if(typeof(res) == "object" && res && typeof(res.then) == "function") res = await res;
                return res;
            }
            const fix = async () => {
                const result = await evaluate()
                if(result && element.hasAttribute("then")){
                    let then = element.getAttribute("then")
                    const retval = this.executeCode(state, then, mapping, element)
                    if(typeof(retval) == "object" && retval && typeof(retval.then) == "function"){
                        await retval;
                    }
                }
                element.style.display = result ? "" : "none"
                return result;
            }
            matches.forEach(match => {
                const key = match.substring(2, match.length - 2)
                element.wd.push(this.observe(this._remap(state, key, mapping), fix))
            })
            const ifres = await fix()
            if(!ifres && isHard) return;
        }

        // If the element is a loop
        if(element.hasAttribute("each")){
            // Expression must always be A in B
            const params = element.getAttribute("each").split(" in ")
            // Remove to avoid recursion later on
            element.removeAttribute("each")
            if(params.length == 2){
                let clones = []
                let [iterator, source] = params
                // Create a dummy, in case all elements are gone we'll insert new clones behind this dummy
                const dummy = document.createElement("span")
                const clone = element.cloneNode(true)
                const parent = element.parentElement
                const src = this.get(state, source, mapping)
                source = this._remap(state, source, mapping)
                parent.insertBefore(dummy, element.nextSibling)
                element.remove()
                const spawnClone = async (after, i) => {
                    const newClone = clone.cloneNode(true)
                    parent.insertBefore(newClone, after)
                    newClone.innerIndex = i
                    const newMapping = JSON.parse(JSON.stringify(mapping))
                    newMapping[iterator] = source + "." + i
                    try {
                        await this.bootstrap(state, newClone, newMapping)
                    } catch(ex){
                        console.error("Bootstraping failed with: ", ex)
                    }
                    return newClone
                }
                const insertClone = async (i) => {
                    let shiftClone = false
                    if(clones.length == 0){
                        clones.push(dummy)
                        shiftClone = true
                    }
                    const newClone = await spawnClone(clones[clones.length - 1].nextSibling, i)
                    clones.push(newClone)
                    if(shiftClone) clones.shift()
                    return newClone
                }
                this.observe(source + ".length", async () => {
                    let item = this.get(state, source, mapping)
                    for(let i=clones.length; i<item.length; i++){
                        await insertClone(i)
                    }
                    while(clones.length > item.length){
                        const last = clones.pop()
                        last.remove()
                    }
                })
                for(let i=0; i<src.length; i++){
                    await insertClone(i)
                }
            }
            // Root element doesn't exist anymore, so skip other processing
            return;
        }

        // Search for all fw:* attributes and fix them
        const attributes = element.getAttributeNames()
        attributes.forEach(attr => {
            if(attr.startsWith("fw:")){
                const content = element.getAttribute(attr)
                const matches = content.match(varmatch)
                if(matches && matches.length > 0){
                    if(attr.startsWith("fw:on")){
                        const self = this
                        element[attr.substring(3)] = function (event) {
                            const res = self.executeCode(state, content, mapping, this, {event})
                            if(typeof(res) == "boolean" && !res){
                                event.stopPropagation()
                                event.preventDefault()
                            }
                            return res;
                        }
                    } else {
                        const fix = () => element.setAttribute(attr.substring(3), content.replace(varmatch, (_, m) =>  {
                            return this.get(state, m, mapping)
                        }))
                        matches.forEach(match => {
                            const key = match.substring(2, match.length - 2)
                            element.wd.push(this.observe(this._remap(state, key, mapping), fix))
                        })
                        fix()
                    }
                }
            }
        })

        // If element has no children, and only has a single node#3, we can replace {...} safely
        if(children.length == 0){
            const content = element.textContent
            const matches = content.match(varmatch)
            if(matches && matches.length > 0){
                const fix = () => element.textContent = content.replace(varmatch, (_, m) =>  {
                    return this.get(state, m, mapping)
                })
                matches.forEach(match => {
                    const key = match.substring(2, match.length - 2)
                    element.wd.push(this.observe(this._remap(state, key, mapping), fix))
                })
                fix()
            }
        }

        // TODO: remove observerss in element.wd on destroy

        // Loop through children
        children.forEach(child => {
            if(child.tagName == "SCRIPT") return;
            this.bootstrap(state, child, mapping)
        })
    }
}