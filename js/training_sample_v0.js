request = window.superagent


USER = 'TEST'
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
    laser_new: 'hemorrhage',
}
DEFAULT_LESION_TYPE = 'hemorrhage'
IGNORE_CHANGES_DELAY = 3000
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
}

function setPositionSize(target, x, y, w, h) {
    // update the element's style
    target.style.width = w + 'px';
    target.style.height = h + 'px';
    // update the size attributes
    target.setAttribute('data-w', w);
    target.setAttribute('data-h', h);
    setPosition(target, x, y)
    target.classList.toggle('toggle_moving', true)
    target.textContent = ''
}

function dragMoveListener (event) {
    var target = event.target;
    // keep the dragged position in the data-x/data-y attributes
    var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
    var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

    x = Math.max(x, 0)
    y = Math.max(y, 0)
    setPosition(target, x, y)
    target.classList.toggle('toggle_moving', true)
    target.textContent = ''
}


function resizeListener (event) {
    var target = event.target;
    var x = (parseFloat(target.getAttribute('data-x')) || 0);
    var y = (parseFloat(target.getAttribute('data-y')) || 0);
    // translate when resizing from top or left edges
    x += event.deltaRect.left;
    y += event.deltaRect.top;

    var w = Math.min(Math.round(event.rect.width), MAX_W)
    var h = Math.min(Math.round(event.rect.height), MAX_H)   
    setPositionSize(target, x, y, w, h)
 }

function destroyThis (event) {
    var t = event.target
    t.parentNode.removeChild(t)
}


var create_box = function () {
    var draggable = document.createElement('div')
    draggable.classList.add('resize-drag')
    draggable.classList.add('interact')

    var w = draggable.offsetWidth
    var h = draggable.offsetHeight
    draggable.setAttribute('data-w', w);
    draggable.setAttribute('data-h', h);

    interact(draggable)
        .draggable({
            onmove: window.dragMoveListener,
            onend: info_text,
        })
        .resizable({
            edges: { left: true, right: true, bottom: true, top: true },
            invert: 'reposition',
        })
        .on('resizemove', window.resizeListener)
        .on('resizeend', info_text)
        .on('tap', cycle_lesion_type)
        .on('hold', window.destroyThis)
    return draggable
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


var fill_container = function (container, arr) {
    for (var i=0; i < arr.length; i++) {
        var d = arr[i]
        var draggable = create_box()
        change_lesion_type(draggable, d['type'])
        setPositionSize(draggable, d['x'], d['y'], d['w'], d['h'])
        info_text(draggable)
        container.appendChild(draggable)
    }
}


var save_feedback = function() {
    log('saved!')
    var el = document.getElementById('saved')
    el.style.display = 'block'
    // el.className = ''
    setTimeout(function() {
        // el.className = 'animated bounceOut'
        el.style.display = 'none'
    }, 600);
}


var save_boxes = function (user, image, index, container) {
    if (container === null){
        log('null container '+index)
        return
    }
    var data = {
        user: user,
        image: image,
        index: index,
        boxes: inspect_container(container),
    }
    request.post('/store')
        .send(data)
        .end(function(err, res){
            if (res.ok) {
                save_feedback()
                log(res.text)
            } else {
                alert('Storage error')
                log(res.text)
            }
        })
}


var load_boxes = function (user, image, container) {
    var data = {
        user: user,
        image: image,
    }
    request.post('/retrieve')
        .send(data)
        .end(function(err, res){
            if (res.ok) {
                fill_container(container, res.body)
            } else if (err && err.status === 404) {
                log('No boxes found')
            } else {
                log('load_boxes error: '+res.text)
            }
       })
}


var change_lesion_type = function (box, lesion_type) {
    box.classList.toggle(lesion_type, true)
    box.lesion_type = lesion_type
}


var cycle_lesion_type = function (event) {
    var box = event.target
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
    var x = box.getAttribute('data-x');
    var y = box.getAttribute('data-y');
    var w = box.getAttribute('data-w')
    var h = box.getAttribute('data-h')
    box.end_text = box.lesion_type.toUpperCase()//+' '+w + '×' + h+' at ('+x+','+y+')';
}


var info_text = function (event) {
    try {
        update_info(event.target)
        event.target.classList.toggle('toggle_moving', false)
        event.target.textContent = event.target.end_text
    } catch (e) {
        if (e instanceof TypeError) {
            update_info(event)
            event.classList.toggle('toggle_moving', false)
            event.textContent = event.end_text
        } else {
            throw e
        }
    }
    // t.textContent = t.end_text
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


var begin = function(user, items) {
    var start_index = 0
    request.get('/previous_place')
        .query({user: user})
        .end(function(err, res){
            if (res.ok) {
                start_index = parseInt(res.text)
            } else {
                log('previous_place error: '+res.text)
            }
            gallery = openPhotoSwipe(items, start_index);
       })
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
        if (c == 0) return;
        var drag_container = c[0]
        var draggable = create_box()
        drag_container.appendChild(draggable)
        var w = INIT_W
        var h = INIT_H
        var x = event.layerX - INIT_W/2
        var y = event.layerY - INIT_H/2
        change_lesion_type(draggable, DEFAULT_LESION_TYPE)
        setPositionSize(draggable, x, y, w, h)
        info_text(draggable)
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
            log('saving slide '+(index+1))
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

        var c = container.getElementsByClassName('resize-container')
        if (c.length == 0) {
            var drag_container = document.createElement('div')
            drag_container.className = 'resize-container'
            // Resize container to match image
            drag_container.style.width = container.lastChild.style.width
            drag_container.style.height = container.lastChild.style.height
        } else if (c.length == 1) {
            var drag_container = c[0]
        } else {
            alert('too many interact containers')
        }
        container.insertBefore(drag_container, container.childNodes[0])
        log('boxes loaded for slide: '+index+' '+gallery.items[index].src)
        // image.src contains hostname, just want the relative path
        load_boxes(USER, gallery.items[index].src, drag_container)
    })
    gallery.init();
    return gallery
};

xx = 1


gallery = null
old_swipe_time = (new Date()).getTime()
begin(USER, items)

// thumbnail = document.getElementById('thumbnail')
document.getElementById('btn').onclick = function() { openPhotoSwipe(items) };


