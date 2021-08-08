const IS_NUMBER = /^([\d.]+)$/
const IS_INTEGER = /^(\d+)$/
const IS_STRING = /^(.*)$/
const IS_NULL = /^$/

const IS_EMAIL = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/

const router = {
    _routes: [],
    _split(text, delim) {
        const parts = text.split(delim)
        const front = parts.shift()
        return [front, parts.join(delim)]
    },
    addRoute(match, constraints, callback) {
        if(typeof(callback) == "undefined" && typeof(constraints) == "function"){
            callback = constraints
            constraints = undefined
        }
        this._routes.push({match, callback, constraints})
    },
    route(uri) {
        const query = {}
        const [url, queryString] = this._split(uri, "?")
        queryString.split("&").map(kvPair => {
            const [key, value] = this._split(kvPair, "=")
            if(typeof(query[key]) == "undefined")
                query[key] = decodeURIComponent(value.replace(/\+/g, " "))
        })
        this._routes.every(route => {
            const match = url.match(route.match)
            if(match && match.length > 1){
                match.shift()
                match.push(query)
                if(typeof(route.constraints) == "object" && route.constraints){
                    for (const key in route.constraints) {
                        if (Object.hasOwnProperty.call(route.constraints, key)) {
                            const contraint = route.constraints[key];
                            if(typeof(query[key]) == "undefined") return false;
                            const result = query[key].match(contraint)
                            if(!result) return false;
                        }
                    }
                }
                route.callback(...match)
                return false;
            }
            return true;
        })
    }
}

router.addRoute(/^\/users\/(\d+)$/, (id) => {
    console.log(`I've found user ${id}`)
})

router.addRoute(/^\/users\/(\d+)\/feed$/, { food: IS_EMAIL }, (id, query) => {
    console.log(query)
    console.log(`I've just fed user #${id} with ${query.food}`)
})

router.route("/users/3/feed?food=Banana&hasOwnProperty=troll&constructor=troll")
router.route("/users/3/feed?food=Apple")
router.route("/users/3/feed?food=john@ripe.md")