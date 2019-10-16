const { client } = require('nightwatch-api')
const { After, Before, Given, Then } = require('cucumber')
const webdavHelper = require('../helpers/webdavHelper')
const httpHelper = require('../helpers/httpHelper')
const fetch = require('node-fetch')
const fs = require('fs')
const _ = require('lodash')
const occHelper = require('../helpers/occHelper')
let createdFiles = []
let initialAppConfigSettings

Given('a file with the size of {string} bytes and the name {string} has been created locally', function (size, name) {
  const fullPathOfLocalFile = client.globals.filesForUpload + name
  const fh = fs.openSync(fullPathOfLocalFile, 'w')
  fs.writeSync(fh, 'A', Math.max(0, size - 1))
  fs.closeSync(fh)
  createdFiles.push(fullPathOfLocalFile)
})

Then('the error message {string} should be displayed on the webUI', function (folder) {
  return client
    .page.phoenixPage()
    .waitForElementVisible('@message')
    .expect.element('@message').text.to.equal(folder)
})

Then('the error message {string} should be displayed on the webUI dialog prompt', function (message) {
  return client
    .page.phoenixPage()
    .waitForElementVisible('@ocDialogPromptAlert')
    .expect.element('@ocDialogPromptAlert').text.to.equal(message)
})

Then('no message should be displayed on the webUI', function () {
  return client
    .page.phoenixPage()
    .expect.element('@message').to.not.be.present
})

Then('as {string} the content of {string} should be the same as the local {string}', function (userId, remoteFile, localFile) {
  const fullPathOfLocalFile = client.globals.filesForUpload + localFile
  return webdavHelper
    .download(userId, remoteFile)
    .then(body => assertContentOFLocalFileIs(fullPathOfLocalFile, body))
})

Then('as {string} the content of {string} should not be the same as the local {string}', function (userId, remoteFile, localFile) {
  const fullPathOfLocalFile = client.globals.filesForUpload + localFile
  return webdavHelper
    .download(userId, remoteFile)
    .then(body => assertContentOFLocalFileIsNot(fullPathOfLocalFile, body))
})

const assertContentOFLocalFileIs = function (fullPathOflocalFile, expectedContent) {
  const actualContent = fs.readFileSync(fullPathOflocalFile, { encoding: 'utf-8' })
  return client.assert.strictEqual(
    actualContent, expectedContent, 'asserting content of local file "' + fullPathOflocalFile + '"'
  )
}

const assertContentOFLocalFileIsNot = function (fullPathOflocalFile, expectedContent) {
  const actualContent = fs.readFileSync(fullPathOflocalFile, { encoding: 'utf-8' })
  return client.assert.notEqual(
    actualContent, expectedContent, 'asserting content of local file "' + fullPathOflocalFile + '"'
  )
}

const assertRemoteFileSameAsSkeletonFile = async function (userId, remoteFile, skeletonFile) {
  const skeleton = await webdavHelper.getSkeletonFile(skeletonFile)
  const remote = await webdavHelper.download(userId, remoteFile)
  return client.assert.strictEqual(
    skeleton, remote, `Failed asserting remote file ${remoteFile} is same as skeleton file ${skeletonFile} for user${userId}`
  )
}

Then('as {string} the content of {string} should be the same as the original {string}', function (user, remoteFile, skeletonFile) {
  return assertRemoteFileSameAsSkeletonFile(user, remoteFile, skeletonFile)
})

Given('the setting {string} of app {string} has been set to {string}', function (setting, app, value) {
  return occHelper.runOcc(
    [
      'config:app:set', app, setting, '--value=' + value
    ])
})

Before(function (testCase) {
  createdFiles = []
  if (typeof process.env.SCREEN_RESOLUTION !== 'undefined' && process.env.SCREEN_RESOLUTION.trim() !== '') {
    const resolution = process.env.SCREEN_RESOLUTION.split('x')
    resolution[0] = parseInt(resolution[0])
    resolution[1] = parseInt(resolution[1])
    if (resolution[0] > 1 && resolution[1] > 1) {
      client.resizeWindow(resolution[0], resolution[1])
      console.log('\nINFO: setting screen resolution to ' + resolution[0] + 'x' + resolution[1] + '\n')
    } else {
      console.warn('\nWARNING: invalid resolution given, running tests in full resolution!\n')
      client.maximizeWindow()
    }
  } else {
    client.maximizeWindow()
  }
  console.log('  ' + testCase.sourceLocation.uri + ':' + testCase.sourceLocation.line + '\n')
})

After(async function (testCase) {
  console.log('\n  Result: ' + testCase.result.status + '\n')

  createdFiles.forEach(fileName => fs.unlinkSync(fileName))

  // clear file locks
  const headers = httpHelper.createAuthHeader(client.globals.backend_admin_username)
  const body = new URLSearchParams()
  body.append('global', 'true')
  await fetch(`${client.globals.backend_url}/ocs/v2.php/apps/testing/api/v1/lockprovisioning`,
    { method: 'DELETE', body: body, headers: headers }
  )
})

Before(async function () {
  const resp = await occHelper.runOcc(
    [
      'config:list'
    ])
  let stdOut = _.get(resp, 'ocs.data.stdOut')
  if (stdOut === undefined) {
    throw new Error('stdOut notFound, Found:', resp)
  }
  stdOut = JSON.parse(stdOut)
  initialAppConfigSettings = _.get(stdOut, 'apps')
  if (initialAppConfigSettings === undefined) {
    throw new Error("'apps' was not found inside stdOut of response.")
  }
})

After(async function () {
  const afterConfigSetting = await occHelper.runOcc(
    [
      'config:list'
    ])
  let afterStdOut = _.get(afterConfigSetting, 'ocs.data.stdOut')
  if (afterStdOut === undefined) {
    throw new Error('stdOut notFound, Found:', afterStdOut)
  }
  afterStdOut = JSON.parse(afterStdOut)
  const appConfigSettings = _.get(afterStdOut, 'apps')
  if (appConfigSettings === undefined) {
    throw new Error("'apps' was not found inside stdOut of response.")
  }
  for (const app in initialAppConfigSettings) {
    for (const value in initialAppConfigSettings[app]) {
      if (appConfigSettings[app][value] !== initialAppConfigSettings[app][value]) {
        await occHelper.runOcc(
          [
            'config:app:set',
            app,
            value,
            '--value=' + initialAppConfigSettings[app][value]
          ]
        )
      }
    }
  }
})
