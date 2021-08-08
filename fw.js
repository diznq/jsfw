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
     * @returns {{[key: string]: any}>
     */
    addState(state){
        const self = this
        return new Proxy(state, {
            set(target, key, value){
                const pool = self.watchdog[key] || []
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
                const fix = () => element.textContent = content.replace(/\{(.*?)\}/g, (_, m) => state[m])
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
            const matches = condition.match(/\{([a-zA-Z0-9_]+)\}/g)
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
    count: 0
})


function init(){
    const elements = document.querySelectorAll("[fw]")
    elements.forEach(element => fw.bootstrap(state, element))
}
window.onload = () => init()
