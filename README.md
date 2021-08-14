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