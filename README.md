# FW

Very basic frontend framework created just for fun as a hobby :D

## Examples
Given very basic example with counter
```html
<div fw>
    <h1 fw:onclick="{{count}} += 1">
        <span>Hello, you clicked me {{count}} </span>
        <span if="{{count}}==1">time</span>
        <span if="{{count}}!=1">times</span>
    </h1>
    <h2>Time right now is: {{time}}</h2>
</div>
```

```javascript
const fw = new FW()
const state = fw.addState({count: 0, time: new Date().toString()})

document.querySelectorAll("[fw]").forEach(el => fw.bootstrap(state, el))
setInterval(() => state.time = new Date().toString(), 1000)
```

## Features

### Variables
Variables are declared as `{{variableName}}` and they correspond to given path in `state` object.

They can be traversed just like normal objects, i.e. ``{{parent.property}}` and in case of arrays as `{{array.index}}`, i.e. `{{array.0}}``.

### Dynamic attributes
Attributes prefixed with `fw:` are considered dynamic and they alter original attribute without `fw:` prefix, i.e. `fw:href="#{{activeRoute}}"` sets `href` to `{{activeRoute}}`

### Dynamic events
Just like attributes, events can be defined same way, with speciality that `self` variable is available during call and corresponds to framework object. For example: `fw:onclick="alert({{count}}); return false;"`.

### Conditionals
Each element can become conditional by adding `if` attribute. In case `if` is evaluated true, element is shown, otherwise becomes hidden. In addition to `if` attribute, `then` attribute can be specified as well, which contains code that is called and in case it returns a Promise awaited, before content is shown.

#### Hard ifs
Hard ifs are special case of conditional, where children of element won't listen to changes in state once parent element's condition is evaluated as `false`

### Foreach loop
Each element can become looped by adding `each="item in array"` property. Children can then use `{{item}}` as a dynamic variable.