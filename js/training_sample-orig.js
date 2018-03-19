request = window.superagent


MAX_W = 1024
MAX_H = 1024
INIT_W = 256
INIT_H = 256
LESION_CYCLE = {
    hemorrhage: 'disc',
    disc: 'macula',
    macula: 'exudate',
    exudate: 'laser_old',
    laser_old: 'laser_new',
    laser_new: 'new_vessels',
    new_vessels: 'hemorrhage',
}
DEFAULT_LESION_TYPE = 'hemorrhage'
IGNORE_CHANGES_DELAY = 2000
DEBUG = true


function log(s) {
    if (DEBUG) {
        console.log(s)
    }
}


function setPosition (target, x, y) {
    // translate the element
    target.style.webkitTransform = target.style.transform =
        'translate(' + x + 'px, ' + y + 'px)';

    // update the position attributes
    target.setAttribute('data-x', x);
    target.setAttribute('data-y', y);
    target.classList.toggle('toggle_moving', true)
    // target.textContent = ''
    while (target.firstChild) {
        target.removeChild(target.firstChild);
    }
}

function setPositionSize(target, x, y, w, h) {
    // update the element's style
    target.style.width = w + 'px';
    target.style.height = h + 'px';
    // update the size attributes
    target.setAttribute('data-w', w);
    target.setAttribute('data-h', h);
    setPosition(target, x, y)

}

function getScale(el){
    var rect = el.getBoundingClientRect()
    var scale = {}
    scale.x = rect.width / el.offsetWidth
    scale.y = rect.height / el.offsetHeight
    return scale
}


function dragMoveListener (event) {
    var target = event.target;
    var scale = getScale(target)
    // keep the dragged position in the data-x/data-y attributes
    var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx/scale.x;
    var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy/scale.y;

    x = Math.max(x, 0)
    y = Math.max(y, 0)
    setPosition(target, x, y)
}


function resizeListener (event) {
    var target = event.target;
    var scale = getScale(target)
    var x = (parseFloat(target.getAttribute('data-x')) || 0);
    var y = (parseFloat(target.getAttribute('data-y')) || 0);
    // translate when resizing from top or left edges
    x += event.deltaRect.left/scale.x;
    y += event.deltaRect.top/scale.y;

    var w = Math.min(Math.round(event.rect.width/scale.x), MAX_W)
    var h = Math.min(Math.round(event.rect.height/scale.y), MAX_H)   
    setPositionSize(target, x, y, w, h)
 }


var duplicate_box = function (box) {
    var new_box = box.cloneNode()
    make_draggable(new_box)
    var x = box.getAttribute('data-x')
    var y = box.getAttribute('data-y')
    var w = box.getAttribute('data-w')
    var h = box.getAttribute('data-h')
    setPositionSize(new_box, x, y, w, h)
    change_lesion_type(new_box, box.lesion_type)
    append_box(box.parentNode, new_box)
    info_text(new_box)
}

var delete_box = function (box) {
    var d = box.parentNode.pswp_item
    delete d['boxes'][box.identifier]
    log('del: saved false')
    d['boxes_saved'] = false
    box.parentNode.removeChild(box)
}


var make_draggable = function(draggable) {
    interact(draggable)
        .draggable({
            // inertia: true,
            restrict: {
              restriction: "parent",
              endOnly: false,
              elementRect: { top: 0, left: 0, bottom: 1, right: 1 }
            },
            onstart: function(e) {
                if (e.shiftKey) duplicate_box(e.target);
            },
            onmove: window.dragMoveListener,
            onend: info_text,
        })
        .resizable({
            edges: { left: true, right: true, bottom: true, top: true },
            invert: 'reposition',
            // restrict: {
            //   restriction: "parent",
            //   endOnly: false,
            //   elementRect: { top: 0, left: 0, bottom: 1, right: 1 }
            // },
        })
        .on('resizemove', window.resizeListener)
        .on('resizeend', info_text)
        .on('tap', function(e) {
            if (e.altKey) delete_box(e.target);
            else cycle_lesion_type(e.target);
        })
        .on('hold', function(e) { delete_box(e.target) })

    return draggable
}

var create_box = function () {
    var draggable = document.createElement('div')
    draggable.classList.add('resize-drag')
    draggable.classList.add('interact')

    var w = draggable.offsetWidth
    var h = draggable.offsetHeight
    draggable.setAttribute('data-w', w);
    draggable.setAttribute('data-h', h);


    return make_draggable(draggable)
}

var inspect_container = function(container) {
    var output = []
    var arr = container.getElementsByClassName('resize-drag')
    if (arr) {
        for (var i=0; i < arr.length; i++) {
            var el = arr[i]
            d = {
                x: el.getAttribute('data-x'),
                y: el.getAttribute('data-y'),
                w: el.getAttribute('data-w'),
                h: el.getAttribute('data-h'),
                type: el.lesion_type
            }
            output.push(d)
        }
    }
    return output
}


var append_box = function (container, box) {
    // should be called before update_info
    if (typeof container.last_identifier === 'undefined'){
        // fail safe in case init_boxes didn't occur for some reason
        log('WARNING append_box: last identifier forced = 0!')
        container.last_identifier = 0
     };
    container.last_identifier += 1
    box.identifier = 'box'+container.last_identifier
    container.appendChild(box)
}


var fill_container = function (container, arr) {
    for (var i=0; i < arr.length; i++) {
        var d = arr[i]
        var draggable = create_box()
        change_lesion_type(draggable, d['type'])
        setPositionSize(draggable, d['x'], d['y'], d['w'], d['h'])
        // log('fill append '+container.last_identifier)
        append_box(container, draggable)
        info_text(draggable)
    }
}


var save_feedback = function(feedback) {
    // log('saved!')
    var el = document.getElementById('saved')
    el.style.display = 'block'
    el.className = ''
    el.textContent = feedback
    setTimeout(function() {
        el.className = 'animated fadeOutUp'
		// el.style.display = 'none'
    }, 1000);
}


var save_boxes = function (user, image, index, container) {
    if (container === null){
        log('null container '+index)
        return
    }
    if (!edit_mode_flag.checked) {
        return
    }
    var d = gallery.items[index]
    if (d['boxes_saved'] == true) return;
    var boxes = d['boxes']
    // http://stackoverflow.com/questions/11734417/javascript-equivalent-of-pythons-values-dictionary-method
    var data = {
        user: user,
        image: image,
        index: index,
        boxes: Object.keys(boxes).map(function(key){ return boxes[key] }), //inspect_container(container),
        difficult: d['difficult'],
    }
    log('saving slide '+(index+1))
    request.post('/store')
        .send(data)
        .end(function(err, res){
            if (res.ok) {
                log('saved: saved true')
                d['boxes_saved'] = true
                save_feedback(res.text)
                log(res.text)
            } else {
                alert('Storage error')
                log(res.text)
            }
        })
}


var init_boxes = function (item, container, boxes, difficult) {
    // Throw away local boxes, hopefully they're the same!
    log('init: kill boxes')
    item['boxes'] = {}
    container.last_identifier = 0
    fill_container(container, boxes)
    item['difficult'] = difficult
    item['boxes_saved'] = true
}


var retrieve_boxes = function (user, item, container) {
    var image = item.src
    var data = {
        user: user,
        image: image,
    }
    request.post('/retrieve')
        .send(data)
        .end(function(err, res){
            if (res.ok) {
                init_boxes(item, container, res.body['boxes'], res.body['difficult'])
                log('boxes loaded, saved true')
            } else if (err && err.status === 404) {
                log('No boxes found')
                init_boxes(item, container, {}, false)
            } else {
                log('load_boxes error: '+res.text)
                init_boxes(item, container, {}, false)
            }
       })
}


var change_lesion_type = function (box, lesion_type) {
    // make sure update_info is called after this so data is updated
    // setPosition implicitly calls info_text
    box.classList.toggle(lesion_type, true)
    box.lesion_type = lesion_type
}


var cycle_lesion_type = function (box) {
    // log('tap')
    // // tap is also called on mouseup after hold, check if box still exists in DOM
    // if (box.parentNode) {
    var new_type = LESION_CYCLE[box.lesion_type]
    box.classList.toggle(box.lesion_type, false)
    change_lesion_type(box, new_type)
    info_text(box)
    // } else {
    //     log('killed')
    // }
}


var update_info = function (box) {
    var x = box.getAttribute('data-x')
    var y = box.getAttribute('data-y')
    var w = box.getAttribute('data-w')
    var h = box.getAttribute('data-h')
    box.end_text = box.lesion_type.toUpperCase()+' '+w + '×' + h//+' at ('+x+','+y+')';
    var d = box.parentNode.pswp_item
    d['boxes'][box.identifier] = {x: x, y: y, w: w, h: h, type: box.lesion_type}
    log('update: saved false')
    d['boxes_saved'] = false
}


var info_text = function (event) {
    var f = function (el) {
        update_info(el)
        el.classList.toggle('toggle_moving', false)
        // el.textContent = el.end_text
        var span = document.createElement('span')
        span.textContent = el.end_text
        if (el.firstChild) el.replaceChild(span, el.firstChild);
        else el.appendChild(span);
    }
    try {
        f(event.target)
    } catch (e) {
        if (e instanceof TypeError) {
            f(event)
        } else {
            throw e
        }
    }
    // t.textContent = t.end_text
}

var load_boxes = function(item, image) {
    var container = item.container
    var c = container.getElementsByClassName('resize-container')
    // TODO use .querySelector(".myclass") instead
    if (c.length == 0) {
        var drag_container = document.createElement('div')
        drag_container.className = 'resize-container'
        // Resize container to match image
        drag_container.style.width = image.style.width
        drag_container.style.height = image.style.height
    } else if (c.length == 1) {
        var drag_container = c[0]
    } else {
        alert('too many interact containers')
    }
    container.insertBefore(drag_container, container.childNodes[0])
    drag_container.pswp_item = item
    if (!('boxes' in item)) {
        log('preload: kill boxes')
        // last_identifier is used to assign identifiers to the boxes
        // it doesn't reflect the total number of boxes, but rather the total ever added
        container.last_identifier = 0
        item['boxes'] = {}
        // Clear out any existing drawn boxes
        // http://stackoverflow.com/a/26893663
        while (drag_container.firstChild) {
            drag_container.removeChild(drag_container.firstChild);
        }
    }
    retrieve_boxes(USER, item, drag_container)
}

var reload_boxes = function(gallery) {
    var item = gallery.currItem
    delete item['boxes']
    load_boxes(item, null)
}

var begin = function(user, items) {
    var start_index = 0
    // request.get('/previous_place')
    //     .query({user: user})
    //     .end(function(err, res){
    //         if (res.ok) {
    //             start_index = parseInt(res.text)
    //         } else {
    //             log('previous_place error: '+res.text)
    //         }
    //         gallery = openPhotoSwipe(items, start_index);
    //    })
    gallery = openPhotoSwipe(items);
}


var openPhotoSwipe = function(items, start_index) {
    var pswpElement = document.querySelectorAll('.pswp')[0];
    // define options (if needed)
    var options = {
        index: start_index,
        // history: false,
        // focus: false,

        // showAnimationDuration: 0,
        // hideAnimationDuration: 0

        // Element classes click on which should close the PhotoSwipe.
        // In HTML markup, class should always start with "pswp__", e.g.: "pswp__item", "pswp__caption".
        // 
        // "pswp__ui--over-close" class will be added to root element of UI when mouse is over one of these elements
        // By default it's used to highlight the close button.
        closeElClasses: [],
        pinchToClose: false,
        closeOnScroll: false,
        closeOnVerticalDrag: false,
        escKey: false,
        clickToCloseNonZoomable: false,
        getDoubleTapZoom: function(isMouseClick, item) { return 1 },
    };
    
    var gallery = new PhotoSwipe( pswpElement, PhotoSwipeUI_Default, items, options);

    // gallery.listen('beforeChange', function() {
    //     Caman("#pic", function () {
    //       this.brightness(15).render();
    //     });
    // });
    // gallery.listen('appendImage', function(img) { 
        // Caman(img, function () {
        //   this.brightness(15).render();
        // });
    // });
    gallery.listen('preventDragEvent', function(e, isDown, preventObj) {
        // Don't detect gestures on interact.js objects
        if (e.target.classList.contains('interact') && isDown) {
            // counterintuitive naming, but this will remove PhotoSwipe's gesture detection
            preventObj.prevent = false;
        }
    });
    gallery.listen('doubleTap', function (event, pt) {
        // Create box
        var c = gallery.currItem.container.getElementsByClassName('resize-container')
        if (c.length == 0) {
            alert('doubleTap: no container')
            return
        } else if (c.length == 1) {
            var drag_container = c[0]
        } else {
            alert('doubleTap: too many interact containers')
        }
        var draggable = create_box()
        log('double append' +drag_container.last_identifier)
        append_box(drag_container, draggable)
        var w = INIT_W
        var h = INIT_H
        // Webkit || Firefox compatibility
        var x = event.offsetX || event.layerX
        var y = event.offsetY || event.layerY
        x -= INIT_W/2
        y -= INIT_H/2
        log('place box'+x+' '+y)
        change_lesion_type(draggable, DEFAULT_LESION_TYPE)
        setPositionSize(draggable, x, y, w, h)
        info_text(draggable)
        return false
    })
    gallery.listen('beforeChange', function () {
        var thumbnail = document.getElementById('thumbnail')
        var src = gallery.currItem.src.replace('.jpeg', '.thumb.jpg')
        load_thumbnail(thumbnail, src)
        execute_filter_menu(document.getElementById('thumbnail'), filter_settings)
    })
    gallery.listen('beforeChangeAnim', function (index) {
        difficult_flag.checked = gallery.items[index].difficult
    })
    gallery.listen('afterInit', function () {
        // TODO hackery
        setTimeout(function () {
            log('init set flagged state')
            difficult_flag.checked = gallery.currItem.difficult
        }, 1000)
    })
    gallery.listen('beforeChangeUpdate', function(prevItem) {
        var new_swipe_time = (new Date()).getTime()
        var time_on_slide = new_swipe_time - old_swipe_time
        old_swipe_time = new_swipe_time
        log('t '+time_on_slide)
        if (time_on_slide < IGNORE_CHANGES_DELAY) {
            log('too fast')
            return
        }

        var container = prevItem.container
        var index = gallery.getPreviousIndex()
        // prev index is undefined when first opening
        if (typeof index !== "undefined") {
            var image = gallery.items[index].src;
            save_boxes(USER, image, index, container)
        }
    })
    gallery.listen('appendImage', function(container, image, index) {
        // Thumbnail update, belongs in afterChange
        // var src = container.lastChild.src
        // var src_thumb = src.replace('.jpeg', '.thumb.jpg')
        // thumbnail.removeAttribute('data-caman-id')
        // Caman('#thumbnail', src_thumb, function() {
        //     this.render();
        // });
        // image.src contains hostname, just want the relative path
        log('boxes loading for slide: '+index+' '+image.src+' '+gallery.items[index].src)
        load_boxes(gallery.items[index], image)
    })
    gallery.init();
    return gallery
};


var CamanExample = {
    // http://camanjs.com/examples/
    throttle: function(Q, R) {
        var P, T, U, V, S, W;
        var O = CamanExample.debounce(function() {
            S = V = false
        }, R);
        return function() {
            P = this;
            T = arguments;
            var X = function() {
                U = null;
                if (S) {
                    W = Q.apply(P, T)
                }
                O()
            };
            if (!U) {
                U = setTimeout(X, R)
            }
            if (V) {
                S = true
            } else {
                V = true;
                W = Q.apply(P, T)
            }
            O();
            return W
        }
    },
    debounce: function(Q, S, P) {
        var R, O;
        return function() {
            var W = this,
                V = arguments;
            var U = function() {
                R = null;
                if (!P) {
                    O = Q.apply(W, V)
                }
            };
            var T = P && !R;
            clearTimeout(R);
            R = setTimeout(U, S);
            if (T) {
                O = Q.apply(W, V)
            }
            return O
        }
    },
}


var caman_apply = function(f) {
    Caman(gallery.currItem.container.lastChild, f);
    // Caman(thumbnail, f)
}

var caman_reset = function() {
    var f = function() {
        this.revert(false);
        this.render();
    }
    caman_apply(f)
}

var caman_preset = function(el) {
    var filt = el.innerHTML.toLowerCase()
    var f = function() {
        this[filt]();
        this.render();
    }
    caman_apply(f)
}

var pinhole = function () {
    // nonvignetted variant of pinhole
    var f = function() {
        this.revert(false)
        this.greyscale();
        this.exposure(10);
        this.contrast(15);
        this.render();
    }
    caman_apply(f)
}


var filter_apply = function(caman_instance, filter, value) {
    log(filter+' '+value)
    if (filter == 'greyscale') {
        caman_instance.greyscale()
    } else {
        // log('applying '+ filter+value)
        caman_instance[filter](value)
    }
}


var execute_filter_menu = CamanExample.throttle(function (el, filter_settings, callback) {
    var F = function () {
        this.revert(false)
        // var caman_instance = xx = el
        for (var i=0; i < filter_settings.length; i++) {
            var filter = filter_settings[i]
            if ((typeof filter.value) == 'boolean') {
                if (filter.value) {
                    filter_apply(this, filter.name)
                }
            }
            if (filter.value != filter.default) {
                // Assumes default values don't modify the image
                filter_apply(this, filter.name, filter.value)
            }
        }
        this.render(callback)
    }
    Caman(el, F)
}, 66)

var load_thumbnail = function(el, src) {
    // Erase current data, so Caman will reload it
    // TODO make sure this frees memory
    el.removeAttribute('data-caman-id')
    Caman(el, src, function() { this.render() });
}

var reset_filter_menu = function (e) {
    log('reset filters')
    var f = function (slider) {
        if (slider.type == "checkbox") {
            slider.checked = slider.defaultChecked
        } else {
            slider.value = slider.defaultValue.toString()
        }
    }
    for_sliders(filter_controls, f)
    init_filter_settings(filter_controls, filter_settings)
    execute_filter_menu(document.getElementById('thumbnail'), filter_settings)
}

var open_filter_menu = function(filter_settings) {
    var thumbnail = document.getElementById('thumbnail')
    var src = gallery.currItem.src.replace('.jpeg', '.thumb.jpg')
    var isNewImage = true
    if (isNewImage) {
        load_thumbnail(thumbnail, src)
        execute_filter_menu(thumbnail, filter_settings)
    }
}

var for_sliders = function(el, f) {
    var filters = xx =  el.getElementsByClassName('Filter')
    for (var i=0; i < filters.length; i++) {
        var sliders = filters[i].getElementsByTagName('input')
        for (var j=0; j < sliders.length; j++) {
            var slider = sliders[j]
            f(slider)
        }
    }
}

var init_filter_settings = function(el, filter_settings) {
    // erase the settings
    log('init filter')
    filter_settings.length = 0
    var k = 0
    var f = function (slider) {
        var v, dv
        if (slider.type == "checkbox") {
            v = slider.checked
            dv = slider.defaultChecked
        } else {
            v = parseFloat(slider.value)
            dv = parseFloat(slider.defaultValue)
        }
        filter_settings.push({
            name: slider.getAttribute('data-filter'),
            value: v,
            default: dv,
        })
        slider.filter_index = k
        k += 1
    }
    for_sliders(el, f)
    return filter_settings
}

var attach_sliders = function (el) {
    var g = function (e) {
        var target = e.target
        var target_filter = filter_settings[target.filter_index]
        var v
        if (target.type == "checkbox") {
            v = target.checked
        } else {
            v = parseFloat(target.value)
        }
        if (target_filter.value != v) {
            target_filter.value = v
            execute_filter_menu(document.getElementById('thumbnail'), filter_settings)
        }
    }
    var f = function(slider) {
        slider.onchange = g
        // IE compat: http://stackoverflow.com/a/19067260
        slider.oninput = g
    }
    for_sliders(el, f)
}

var apply_filters = function () {
    execute_filter_menu(gallery.currItem.container.lastChild, filter_settings)
 }


var dragMoveListener_2dslider = function (event, x_input, y_input, scale, limits) {
    // takes 2 slider elements <input type=range> and turns it into a 2D drag    
    var x = filter_settings[x_input.filter_index].value + event.dx/scale.x;
    var y = filter_settings[y_input.filter_index].value + event.dy/scale.y;
    x = Math.min(Math.max(x, limits.x_min), limits.x_max)
    y = Math.min(Math.max(y, limits.y_min), limits.y_max)

    x_input.value = x.toString()
    y_input.value = y.toString()
    filter_settings[x_input.filter_index].value = x
    filter_settings[y_input.filter_index].value = y
    execute_filter_menu(document.getElementById('thumbnail'), filter_settings)
}


var get_limits_xy = function (x_input, y_input) {
    var limits = {
        x_min: parseFloat(x_input.min),
        x_max: parseFloat(x_input.max),
        y_min: parseFloat(y_input.min),
        y_max: parseFloat(y_input.max),
    }
    return limits
}

var update_slider_label = function(el) {

}


var edit_mode_flag = document.getElementById('edit-switch')
edit_mode_flag.onchange = function(event) {}

var styleEl = document.createElement('style')
// Append style element to head
document.head.appendChild(styleEl);
// Grab style sheet
var styleSheet = styleEl.sheet;
var hide_boxes_flag = document.getElementById('hide-switch')
hide_boxes_flag.onchange = function(event) {
    log('hide')
    if (event.target.checked) {
        styleSheet.insertRule('.resize-container { display: none }', 0);
    } else {
        styleSheet.deleteRule(0);
    }
}

var difficult_flag = document.getElementById('difficult-switch')
difficult_flag.onchange = function(event) {
    var d = gallery.currItem
    d['boxes_saved'] = false
    d['difficult'] = event.target.checked
    log(d.difficult)
}


var filter_settings = []
var filter_controls = document.getElementById('FilterControls')
filter_settings = init_filter_settings(filter_controls, filter_settings)
attach_sliders(filter_controls)

var brightness = document.getElementById('brightness2d')
var contrast = document.getElementById('contrast2d')
var vibrance = document.getElementById('vibrance2d')
var gamma = document.getElementById('gamma2d')
interact(document.getElementById('thumbnail'))
    .draggable({
        snap: {
          targets: [
            interact.createSnapGrid({ x: 1, y: 1 })
          ],
          range: Infinity,
          relativePoints: [ { x: 0, y: 0 } ]
        },
        onstart: function(e) {
            // make cursor disapper
            // display info text
            // reset to 0?
        },
        onmove: function(e) {
            // TODO set scale based on step attribute
            var cb_limits = get_limits_xy(contrast, brightness)
            var vg_limits = get_limits_xy(vibrance, gamma)
            if (e.shiftKey) {
                dragMoveListener_2dslider(e, vibrance, gamma, {x: 0.1, y: 100}, vg_limits)
            } else {
                dragMoveListener_2dslider(e, contrast, brightness, {x: 1, y: -1}, cb_limits)
            }
        }
        // onend: info_text,
    })

gallery = null
old_swipe_time = (new Date()).getTime()
begin(USER, items)

var modal_opts = {
  clickOutside: true,
  closeKey: 27,
  transitions: true,
  onBeforeOpen: function() { open_filter_menu(filter_settings) },
  // onBeforeClose: function() {},
  // onOpen: function() {},
  onClose: function() { },
}
var modal = new VanillaModal(modal_opts)

document.getElementById('btn').onclick = function() { openPhotoSwipe(items) };
