class FW {
    /**
     * Create new framework instance
     */
    constructor(){
        this.watchdog = {}
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
                const pool = self.watchdog[path] || []
                target[key] = value
                pool.forEach(item => item())
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
        return () => {
            this.watchdog[key] = this.watchdog[key].map(fn => fn != callback)
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
        while(parts.length > 0) obj=obj[parts.shift()]
        return obj[end]
    }

    /**
     * Bootstrap element
     * @param {!{[key: string]: any}} state
     * @param {!HTMLElement} element 
     * @param {?{[key: string]: string}} mapping
     */
    bootstrap(state, element, mapping) {
        element.wd = element.wd || []
        mapping = mapping || {}
        const children = element.querySelectorAll(":scope > *")
        
        // If element is a conditional, hide it if the condition fails, display it otherwise
        if(element.hasAttribute("if")){
            let condition = element.getAttribute("if")
            const matches = condition.match(/\{([a-zA-Z0-9_.]+)\}/g)
            condition = condition.replace(/\{(.*?)\}/g, (_, m) => {
                return "__STATE__." + this.remap(state, m, mapping)
            })
            const evaluate = () => {
                if(condition.indexOf("return") == -1) condition = `return (${condition})`;
                const fn = new Function("__STATE__", condition)
                const res = fn(state)
                return res;
            }
            const fix = () => element.style.display = evaluate() ? "" : "none"
            matches.forEach(match => {
                const key = match.substring(1, match.length - 1)
                element.wd.push(this.addWatchdog(this.remap(state, key, mapping), fix))
            })
            fix()
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
                console.log(src, source)
                parent.insertBefore(dummy, element.nextSibling)
                element.remove()
                const spawnClone = (after, i) => {
                    const newClone = clone.cloneNode(true)
                    parent.insertBefore(newClone, after)
                    newClone.innerIndex = i
                    const newMapping = JSON.parse(JSON.stringify(mapping))
                    newMapping[iterator] = source + "." + i
                    this.bootstrap(state, newClone, newMapping)
                    return newClone
                }
                const insertClone = (i) => {
                    let shiftClone = false
                    if(clones.length == 0){
                        clones.push(dummy)
                        shiftClone = true
                    }
                    const newClone = spawnClone(clones[clones.length - 1].nextSibling, i)
                    clones.push(newClone)
                    if(shiftClone) clones.shift()
                    return newClone
                }
                this.addWatchdog(source + ".length", () => {
                    let item = this.get(state, source, {})
                    for(let i=clones.length; i<item.length; i++){
                        insertClone(i)
                    }
                    while(clones.length > item.length){
                        const last = clones.pop()
                        last.remove()
                    }
                })
                for(let i=0; i<src.length; i++){
                    insertClone(i)
                }
            }
            // Root element doesn't exist anymore, so skip other processing
            return;
        }

        // If element has no children, and only has a single node#3, we can replace {...} safely
        if(children.length == 0){
            const content = element.textContent
            const matches = content.match(/\{(.*?)\}/g)
            if(matches && matches.length > 0){
                const fix = () => element.textContent = content.replace(/\{(.*?)\}/g, (_, m) =>  {
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

const fw = new FW()
const state = fw.addState({
    hello: "Hello world",
    annyeong: "안녕",
    name: "",
    count: 0,
    arr: [
        ["Jakub", "Anna"]
    ],
    nested: {
        variable: 0
    }
})


function init(){
    const elements = document.querySelectorAll("[fw]")
    elements.forEach(element => fw.bootstrap(state, element))
}
window.onload = () => init()
