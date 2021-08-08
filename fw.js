class FW {
    /**
     * Create new framework instance
     */
    constructor(){
        this.watchdog = {}
    }

    /**
     * Create state
     * @param {[key: string]: any} state 
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
     * Get variable from state
     * @param {!{[key: string]: any}} state 
     * @param {!string} path 
     * @returns {any}
     */
    get(state, path){
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
     */
    bootstrap(state, element) {
        element.wd = element.wd || []
        const children = element.querySelectorAll(":scope > *")
        // If element has no children, and only has a single node#3, we can replace {...} safely
        if(children.length == 0){
            const content = element.textContent
            const matches = content.match(/\{(.*?)\}/g)
            if(matches && matches.length > 0){
                const fix = () => element.textContent = content.replace(/\{(.*?)\}/g, (_, m) => this.get(state, m))
                matches.forEach(match => {
                    const key = match.substring(1, match.length - 1)
                    element.wd.push(this.addWatchdog(key, fix))
                })
                fix()
            }
        }

        // If element is conditional, hide it if condition fails, display otherwise
        if(element.hasAttribute("if")){
            let condition = element.getAttribute("if")
            const matches = condition.match(/\{([a-zA-Z0-9_.]+)\}/g)
            condition = condition.replace(/\{(.*?)\}/g, "__STATE__.$1")
            const evaluate = () => {
                if(condition.indexOf("return") == -1) condition = `return (${condition})`;
                const fn = new Function("__STATE__", condition)
                const res = fn(state)
                return res;
            }
            const fix = () => element.style.display = evaluate() ? "" : "none"
            matches.forEach(match => {
                const key = match.substring(1, match.length - 1)
                element.wd.push(this.addWatchdog(key, fix))
            })
            fix()
        }

        // TODO: remove watchdogs in element.wd on destroy

        // Loop through children
        children.forEach(child => {
            if(child.tagName == "SCRIPT") return;
            this.bootstrap(state, child)
        })
    }

}

const fw = new FW()
const state = fw.addState({
    hello: "Hello world",
    annyeong: "안녕",
    name: "",
    count: 0,
    nested: {
        variable: 0
    }
})


function init(){
    const elements = document.querySelectorAll("[fw]")
    elements.forEach(element => fw.bootstrap(state, element))
}
window.onload = () => init()
