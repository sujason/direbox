import os
import shelve
import cherrypy
import pandas
import numpy as np


path = 'data/train/'
class Query(object):
    def __init__(self, shelve, column_funcs):
        self.users = set()
        self.shelve = shelve
        self.column_funcs = column_funcs

        csv = os.path.join('../data/trainLabels.csv')
        image_names = np.loadtxt(csv, delimiter=',', usecols=[0], skiprows=1, dtype=str)
        image_files = ['data/train/%s.jpeg' % e for e in image_names]
        severity = np.loadtxt(csv, delimiter=',', usecols=[1], skiprows=1)
        self.db = pandas.DataFrame({'severity': severity}, index=image_files)
        self.update()
    
    def update(self, default_value=-1):
        for k, v in self.shelve.iteritems():
            try:
                image_file, user = k.split(' ')
            except ValueError:
                # Bad workaround for left over entries from initial testing in shelve
                continue
            if isinstance(v, list):
                # Bad workaround for left over entries from initial testing in shelve
                continue
            if '/' not in image_file:
                # Bad workaround for left over entries from initial testing in shelve
                continue
            self.users.add(user)
            for column, fn in self.column_funcs.iteritems():
                col_name = '%s:%s' % (user, column)
                # Initialize column
                if col_name not in self.db:
                    self.db[col_name] = np.ones(len(self.db))*default_value
                try:
                    self.db[col_name].loc[image_file] = fn(v[column])
                except KeyError:
                    self.db[col_name].loc[image_file] = default_value


    def query(self, d):
        # Returns rows that satisfy all conditions
        self.update()
        users = d.pop('user', self.users)
        filter_mask = np.ones(len(self.db), dtype=bool)
        for column, compare in d.iteritems():
            if column == 'severity':
                cols = [column]
            else:
                cols = ['%s:%s' % (user, column) for user in users]
            # Accept a result from any user (with logical_or), though we don't
            # currently have the capacity to show client each user's data
            mask = np.logical_or.reduce(compare(self.db[cols]), axis=1).squeeze()
            # But all conditions must be satisfied
            filter_mask = np.logical_and(filter_mask, mask)
        rows = self.db.index[filter_mask]
        return self.db.loc[rows]


class StringGenerator(object):
    def __init__(self, db):
        self.db = db
        column_funcs = {
            'boxes': len,
            'difficult': lambda x: x,
        }
        self.db_query = Query(db, column_funcs)
        d = shelve.open('viewer_data.shelve')
        self.viewer_data = dict(d)
        d.close()
        with open('query.html') as f:
            self.query_html = f.read()

    @staticmethod
    def parse_data(image, user, **kwargs):
        # Convert unicode to ascii
        return str(image), str(user), kwargs

    @staticmethod
    def get_comparator(ask):
        if 'lt' in ask:
            v = float(ask.replace('lt', ''))
            compare = lambda x, v=v: x < v
        elif 'gt' in ask:
            v = float(ask.replace('gt', ''))
            compare = lambda x, v=v: x > v
        elif 'ne' in ask:
            v = float(ask.replace('ne', ''))
            compare = lambda x, v=v: x != v
        elif 'to' in ask:
            v1, v2 = [float(e) for e in ask.split('to')]
            compare = lambda x, v1=v1, v2=v2: np.logical_and(x >= v1, x <= v2)
        else:
            v = float(ask)
            compare = lambda x, v=v: x == v
        return compare

    @cherrypy.expose
    def query(self, user=None, severity=None, boxes=None, difficult=None):
        d = {}
        if user is not None:
            d['user'] = list(user.split(','))
        kwargs = {
            'severity': severity,
            'boxes': boxes,
            'difficult': difficult,
        }
        for k, ask in kwargs.iteritems():
            if ask is not None:
                d[k] = self.get_comparator(ask)
        result = self.db_query.query(d)
        items = [self.viewer_data[e.split('.')[0]] for e in result.index]
        if not items:
            return 'No items found!'
        with open('query.html') as f:
            self.query_html = f.read()
        html = self.query_html
        s = 'var items = %s' % items
        return html.replace('<script id="cherrypy">', '<script id="cherrypy">'+s)


    @cherrypy.expose
    def index(self):
        return file('training_sample.html')

    @cherrypy.expose
    def database(self):
        s = '<pre>'
        for item in db.iteritems():
            s += '%s --- %s\n' % item
        s += '</pre>'
        return s

    @cherrypy.expose
    def previous_place(self, user):
        user = str(user)
        if user in self.db:
            return '%d' % self.db[user]
        else:
            return '0'

    @cherrypy.expose
    @cherrypy.tools.json_in()
    def store(self):
        d = cherrypy.request.json
        image, user, data = self.parse_data(**d)
        self.db[user] = data.pop('index')
        self.db['%s %s' % (image, user)] = data
        db.sync()
        return '%d boxes saved' % len(data['boxes'])

    @cherrypy.expose
    @cherrypy.tools.json_in()
    @cherrypy.tools.json_out()
    def retrieve(self):
        # d = json.loads(d)
        d = cherrypy.request.json
        image, user, _ = self.parse_data(**d)
        # return json.dumps(self.db[(image, user)])
        try:
            return self.db['%s %s' % (image, user)]
        except KeyError:
            raise cherrypy.HTTPError(404)


if __name__ == '__main__':
    db = shelve.open('lesion_boxes.shelve')
    conf = {
        '/': {
            'tools.sessions.on': True,
            'tools.staticdir.root': os.path.abspath(os.getcwd()),
            'tools.staticdir.on': True,
            'tools.staticdir.dir': './'
        },
        '/data': {
            'tools.staticdir.on': True,
            'tools.staticdir.dir': '../data/'
        }
    }
    try:
        # cherrypy.quickstart(StringGenerator(db), '/', conf)
        cherrypy.tree.mount(StringGenerator(db), '/', config=conf)
        cherrypy.config.update({'server.socket_host': '127.0.0.1', 'server.socket_port': 8080})
        cherrypy.engine.start()
        cherrypy.engine.block()
    finally:
        print 'Closing...'
        db.close()
