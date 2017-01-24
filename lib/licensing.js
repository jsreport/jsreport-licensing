/* eslint no-path-concat: 0 */

var Promise = require('bluebird')
var path = require('path')
var fs = require('fs')
var readFileAsync = Promise.promisify(fs.readFile)
var writeFileAsync = Promise.promisify(fs.writeFile)
var request = require('request')
var hostname = require('os').hostname()
var crypto = require('crypto')
var md5 = crypto.createHash('md5')
var hostId = md5.update(hostname + __dirname).digest('hex')
var mkdirp = require('mkdirp')
var mkdirpAsync = Promise.promisify(mkdirp)

function verifyLicenseKey (reporter, definition, key) {
  reporter.logger.info('Veryfing license key ' + key)
  return countTemplates(reporter).then(function (count) {
    return verifyInCache(reporter, definition, {
      licenseKey: key,
      mode: reporter.options.mode,
      numberOfTemplates: count,
      version: reporter.version,
      hostId: hostId
    })
  })
}

function verifyInCache (reporter, definition, m) {
  var pathToCacheFile = path.join(reporter.options.tempDirectory, 'licensing', 'cache.json')

  function verifyAndWriteCache () {
    return verifyInService(reporter, definition, m).then(function () {
      m.lastCheck = new Date().getTime()
      m.license = definition.options.license
      return writeFileAsync(pathToCacheFile, JSON.stringify(m))
    })
  }

  return mkdirpAsync(path.join(reporter.options.tempDirectory, 'licensing')).then(function () {
    return readFileAsync(pathToCacheFile, 'utf8').then(function (content) {
      var cache = JSON.parse(content)

      if (cache.licenseKey === m.licenseKey && cache.mode === m.mode &&
        cache.numberOfTemplates === m.numberOfTemplates && cache.version === m.version &&
        cache.hostId === m.hostId && (new Date(cache.lastCheck + 120000) > new Date())) {
        definition.options.license = cache.license
        reporter.logger.info('Using cached license ' + definition.options.license)
        return false
      } else {
        return true
      }
    }).catch(function () {
      // handling if cache file doesn't exist
      return verifyAndWriteCache()
    }).then(function (val) {
      if (val === true) {
        // cache is not up to day and we need to perform verification request
        return verifyAndWriteCache()
      }
    })
  })
}

function verifyInService (reporter, definition, m) {
  return new Promise(function (resolve, reject) {
    var isDone = false

    function handleFailedVerification () {
      isDone = true
      if (m.licenseKey === 'free' && m.numberOfTemplates > 5) {
        if (reporter.express && reporter.express.server) {
          reporter.express.server.close()
        }

        return reject(new Error('Free license cannot be used for more than 5 templates'))
      }

      if (m.numberOfTemplates > 5) {
        definition.options.license = 'enterprise'
        reporter.logger.info('Unable to verify license key, assuming enterprise')
      } else {
        definition.options.license = 'free'
        reporter.logger.info('Unable to verify license key, assuming free')
      }

      resolve()
    }

    var timeout = setTimeout(handleFailedVerification, 3000).unref()

    request({
      url: 'https://jsreportonline.net/license-key',
      method: 'POST',
      body: m,
      json: true
    }, function (err, response, body) {
      if (isDone) {
        return
      }
      clearTimeout(timeout)

      if (err || response.statusCode !== 200) {
        return handleFailedVerification()
      }

      if (body.status === 0) {
        definition.options.license = body.license
        reporter.logger.info(body.message)
        return resolve()
      }

      if (reporter.express && reporter.express.server) {
        reporter.express.server.close()
      }
      reject(new Error(body.message))
    })
  })
}

function countTemplates (reporter) {
  return reporter.documentStore.collection('templates').count({})
}

module.exports = function (reporter, definition) {
  reporter.on('express-configure', function (app) {
    app.post('/api/licensing/trial', function (req, res, next) {
      verifyLicenseKey(reporter, definition, 'free').then(function () {
        res.send({ status: 0 })
      }).catch(function (e) {
        reporter.logger.warn('Unable to start trial license')
        res.send({ status: 1 })
      })
    })
  })

  reporter.initializeListeners.add('licensing', function () {
    if (reporter.options['license-key']) {
      return verifyLicenseKey(reporter, definition, reporter.options['license-key'])
    }

    var licenseKeyPath
    if (fs.existsSync(path.join(reporter.options.rootDirectory, 'license-key.txt'))) {
      licenseKeyPath = path.join(reporter.options.rootDirectory, 'license-key.txt')
    }

    if (fs.existsSync(path.join(reporter.options.dataDirectory, 'license-key.txt'))) {
      licenseKeyPath = path.join(reporter.options.dataDirectory, 'license-key.txt')
    }

    if (licenseKeyPath) {
      return readFileAsync(licenseKeyPath, 'utf8').then(function (key) {
        if (key.charCodeAt(0) === 0xFEFF) {
          key = key.substring(1)
        }
        return verifyLicenseKey(reporter, definition, key.toString())
      })
    }

    return verifyLicenseKey(reporter, definition, 'free')
  })
}
