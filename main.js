const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const { isProbablyGitUrl, getRepoNameFromUrl, shQuote } = require('./helper')

let mainWindow

const settingsPath = path.join(__dirname, 'settings.json')

function readSettings () {
  try {
    if (!fs.existsSync(settingsPath)) {
      return {}
    }
    const raw = fs.readFileSync(settingsPath, 'utf8')
    return JSON.parse(raw || '{}')
  } catch (e) {
    console.error('readSettings error:', e)
    return {}
  }
}

function writeSettings (data) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch (e) {
    console.error('writeSettings error:', e)
    return false
  }
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1034,
    height: 768,
    frame: false,
    backgroundColor: '#202020',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'src/index.html'))
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close()
})

ipcMain.handle('get-dotnet-templates', async () => {
  return new Promise((resolve) => {
    exec('dotnet new --list', { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) {
        console.error('dotnet error:', err || stderr)
        return resolve([])
      }

      const templates = parseDotnetListRu(stdout)
      console.log('TEMPLATES COUNT:', templates.length)
      resolve(templates)
    })
  })
})

function parseDotnetListRu(text) {
  const lines = text.split(/\r?\n/)

  const headerIndex = lines.findIndex(l =>
    /имя шаблона/i.test(l) &&
    /короткое имя/i.test(l)
  )
  if (headerIndex === -1) {
    console.log('header not found')
    return []
  }

  const dataLines = lines.slice(headerIndex + 2)

  const templates = []

  for (const raw of dataLines) {
    const line = raw.trim()
    if (!line) continue
    if (/^-+$/.test(line)) continue

    const parts = line.split(/\s{2,}/).filter(Boolean)
    if (parts.length < 2) continue

    const name = parts[0]
    const shortName = parts[1] || ''
    const language = parts[2] || ''
    const tags = parts[3] || ''

    templates.push({ name, shortName, language, tags })
  }

  return templates
}

ipcMain.handle('get-default-documents-path', () => {
  return app.getPath('documents')
})

ipcMain.handle('choose-project-folder', async (event, startPath) => {
  const win = BrowserWindow.fromWebContents(event.sender)

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Выберите папку',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: (startPath && String(startPath).trim()) ? startPath : app.getPath('documents')
  })

  if (canceled || !filePaths || filePaths.length === 0) return null
  return filePaths[0]
})

ipcMain.handle('choose-editor-file', async (event, startPath) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)

    const options = {
      title: 'Выберите исполняемый файл редактора',
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    }
    const { canceled, filePaths } = await dialog.showOpenDialog(win, options)

    if (canceled || !filePaths || filePaths.length === 0) return null
    return filePaths[0]
  } catch (e) {
    console.error('choose-editor-file handler ERROR:', e)
    return null
  }
})

ipcMain.handle('create-project', async (event, data) => {
  const { template, name, path: projectPath } = data || {}

  if (!template || !name || !projectPath) {
    return {
      ok: false,
      error: 'Не заданы template / name / path'
    }
  }

  const cmd = `dotnet new ${template} -n "${name}"`
  return new Promise((resolve) => {
    exec(cmd, { cwd: projectPath, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        console.error('dotnet new error:', error)
        return resolve({
          ok: false,
          error: error.message,
          stdout,
          stderr
        })
      }

      console.log('dotnet new stdout:', stdout)
      if (stderr) console.log('dotnet new stderr:', stderr)

      resolve({
        ok: true,
        stdout,
        stderr
      })
    })
  })
})

ipcMain.handle('open-in-vscode', async (event, projectPath) => {
  if (!projectPath) {
    return { ok: false, error: 'projectPath is empty' }
  }

  const settings = readSettings()
  const editorPath = settings.editorPath

  if (!editorPath) {
    return { ok: false, error: 'editorPath is empty in settings.json' }
  }
  const editorCmdPath = `"${editorPath}"`
  const cmd = `${editorCmdPath} "${projectPath}"`

  return new Promise((resolve) => {
    exec(cmd, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        console.error('VS Code open error:', error)
        return resolve({
          ok: false,
          error: error.message,
          stdout,
          stderr
        })
      }

      resolve({
        ok: true,
        stdout,
        stderr
      })
    })
  })
})

ipcMain.handle('get-settings', () => {
  return readSettings()
})

ipcMain.handle('set-settings', (event, newSettings) => {
  const current = readSettings()
  const merged = { ...current, ...newSettings }
  const ok = writeSettings(merged)
  return { ok }
})

ipcMain.handle('add-recent-project', (event, project) => {
  try {
    if (!project || !project.name || !project.path) {
      return { ok: false, error: 'invalid project data' }
    }

    const settings = readSettings()
    const list = Array.isArray(settings.recentProjects) ? settings.recentProjects : []

    const filtered = list.filter(p => p.path !== project.path)
    const updated = [{ name: project.name, path: project.path }, ...filtered]

    settings.recentProjects = updated
    const ok = writeSettings(settings)
    return { ok }
  } catch (e) {
    console.error('add-recent-project error:', e)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('delete-project-folder', async (event, projectPath) => {
  try {
    if (!projectPath) {
      return { ok: false, error: 'empty projectPath' }
    }

    if (!fs.existsSync(projectPath)) {
      return { ok: true, warning: 'folder does not exist' }
    }

    await fs.promises.rm(projectPath, { recursive: true, force: true })

    return { ok: true }
  } catch (e) {
    console.error('delete-project-folder error:', e)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('clone-repository', async (event, data) => {
  const { repoUrl, targetDir } = data || {}

  if (!repoUrl || !targetDir) {
    return { ok: false, error: 'Не заданы repoUrl / targetDir' }
  }

  const url = String(repoUrl).trim()
  const destDir = String(targetDir).trim()

  if (!isProbablyGitUrl(url)) {
    return { ok: false, error: 'Некорректная ссылка на репозиторий' }
  }

  const gitVersion = await new Promise((resolve) => {
    exec('git --version', { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) return resolve({ ok: false, error: stderr || error.message })
      resolve({ ok: true, stdout })
    })
  })
  if (!gitVersion.ok) {
    return { ok: false, error: 'Git не найден. Установите git.' }
  }

  const lsRemote = await new Promise((resolve) => {
    exec(`git ls-remote ${shQuote(url)}`, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        return resolve({
          ok: false,
          error: 'Репозиторий недоступен или требуется авторизация',
          stderr: stderr || error.message
        })
      }
      resolve({ ok: true, stdout, stderr })
    })
  })
  if (!lsRemote.ok) return lsRemote

  const repoName = getRepoNameFromUrl(url)
  const clonedPath = path.join(destDir, repoName)

  if (fs.existsSync(clonedPath)) {
    return { ok: false, error: `Папка уже существует: ${clonedPath}` }
  }

  return await new Promise((resolve) => {
    const cmd = `git clone ${shQuote(url)} ${shQuote(clonedPath)}`
    exec(cmd, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        return resolve({
          ok: false,
          error: error.message,
          stdout,
          stderr
        })
      }

      resolve({
        ok: true,
        repoName,
        clonedPath,
        stdout,
        stderr
      })
    })
  })
})