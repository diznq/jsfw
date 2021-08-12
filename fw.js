class FW {
    /**
     * Create new framework instance
     */
    constructor(){
        this.watchdog = {}
        this.varmatch = /\{([a-zA-Z0-9_.]+)\}/g;
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
                pools.forEach(pool => (self.watchdog[pool] || []).forEach(item => item()))
                return true;
            }
        })
    }

    /**
     * Add listener
     * @param {!string} key 
     * @param {!(() => void)} callback 
     * @param {?boolean} run 
     */
    addWatchdog(key, callback, run){
        run = run || false
        this.watchdog[key] = this.watchdog[key] || []
        this.watchdog[key].push(callback)
        if(run) callback()
        return {
            key,
            remove: () => {
                this.watchdog[key] = this.watchdog[key].map(fn => fn != callback)
            }
        }
    }

    /**
     * Remap state variable
     * @param {string} key 
     * @param {{[key: string]: string}} mapping 
     */
    remap(state, key, mapping){
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
        path = this.remap(state, path, mapping)
        const parts = path.split(".")
        let obj = state
        let end = parts.pop()
        while(parts.length > 0 && typeof(obj) != "undefined") obj=obj[parts.shift()]
        if(typeof(obj) == "object" && !obj) return null
        else if(typeof(obj) == "undefined") return null
        return obj[end]
    }

    executeCode(state, code, mapping, self) {
        const varmatch = this.varmatch
        code = code.replace(varmatch, (_, m) => {
            return "__STATE__." + this.remap(state, m, mapping).replace(/\.(\d+)/g, "[$1]")
        })
        if(code.indexOf("return") == -1) code = `return (${code})`;
        const fn = new Function("__STATE__,self", code)
        if(typeof(self) != "undefined") 
            return fn.call(self, state, this)
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
        
        // If element is a conditional, hide it if the condition fails, display it otherwise
        if(element.hasAttribute("if")){
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
            }
            matches.forEach(match => {
                const key = match.substring(1, match.length - 1)
                element.wd.push(this.addWatchdog(this.remap(state, key, mapping), fix))
            })
            await fix()
        }

        // If element is a loop
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
                source = this.remap(state, source, mapping)
                parent.insertBefore(dummy, element.nextSibling)
                element.remove()
                const spawnClone = async (after, i) => {
                    const newClone = clone.cloneNode(true)
                    parent.insertBefore(newClone, after)
                    newClone.innerIndex = i
                    const newMapping = JSON.parse(JSON.stringify(mapping))
                    newMapping[iterator] = source + "." + i
                    await this.bootstrap(state, newClone, newMapping)
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
                this.addWatchdog(source + ".length", async () => {
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
                            const res = self.executeCode(state, content, mapping, this)
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
                            const key = match.substring(1, match.length - 1)
                            element.wd.push(this.addWatchdog(this.remap(state, key, mapping), fix))
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
                    const key = match.substring(1, match.length - 1)
                    element.wd.push(this.addWatchdog(this.remap(state, key, mapping), fix))
                })
                fix()
            }
        }

        // TODO: remove watchdogs in element.wd on destroy

        // Loop through children
        children.forEach(child => {
            if(child.tagName == "SCRIPT") return;
            this.bootstrap(state, child, mapping)
        })
    }
}