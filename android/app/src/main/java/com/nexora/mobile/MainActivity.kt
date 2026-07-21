package com.nexora.mobile

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.net.http.SslError
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.security.MessageDigest

class MainActivity : Activity() {
    private data class Server(val id: String, val url: String, val label: String)

    private val preferences by lazy { getSharedPreferences("nexora_servers", Context.MODE_PRIVATE) }
    private var webView: WebView? = null
    private var activeServer: Server? = null
    private var fileChooser: ValueCallback<Array<Uri>>? = null
    private var pendingAudioRequest: PermissionRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(8, 5, 13)
        handleConnectLink(intent)?.let { saveAndOpen(it); return }
        val activeId = preferences.getString("active", null)
        val server = loadServers().firstOrNull { it.id == activeId }
        if (server == null) showServerPicker() else openServer(server)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleConnectLink(intent)?.let { saveAndOpen(it) }
    }

    private fun handleConnectLink(intent: Intent): Server? {
        val data = intent.data ?: return null
        if (data.scheme != "nexora" || data.host != "connect") return null
        return runCatching { normalizedServer(data.getQueryParameter("url") ?: "") }
            .onFailure { toast("QR-ссылка Nexora повреждена") }.getOrNull()
    }

    private fun normalizedServer(raw: String): Server {
        val value = raw.trim().removeSuffix("/")
        val uri = URI(value)
        require(uri.scheme.equals("https", true)) { "Nexora подключается только по HTTPS" }
        require(!uri.host.isNullOrBlank() && uri.userInfo == null && uri.fragment == null) { "Некорректный адрес сервера" }
        require((uri.path.isNullOrBlank() || uri.path == "/") && uri.query == null) { "Укажите адрес сервера без пути и параметров" }
        val port = if (uri.port == -1) 443 else uri.port
        require(port in 1..65535) { "Некорректный порт" }
        val normalized = URI("https", null, uri.host.lowercase(), uri.port, null, null, null).toString()
        val id = MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray()).joinToString("") { "%02x".format(it) }.take(24)
        return Server(id, normalized, uri.host)
    }

    private fun loadServers(): MutableList<Server> {
        val raw = preferences.getString("servers", "[]") ?: "[]"
        return runCatching {
            val array = JSONArray(raw)
            MutableList(array.length()) { index ->
                val item = array.getJSONObject(index)
                Server(item.getString("id"), item.getString("url"), item.optString("label", item.getString("url")))
            }
        }.getOrDefault(mutableListOf())
    }

    private fun saveServers(servers: List<Server>) {
        val array = JSONArray()
        servers.forEach { server -> array.put(JSONObject().put("id", server.id).put("url", server.url).put("label", server.label)) }
        preferences.edit().putString("servers", array.toString()).apply()
    }

    private fun saveAndOpen(server: Server) {
        val servers = loadServers().filterNot { it.id == server.id }.toMutableList().apply { add(server) }
        saveServers(servers)
        preferences.edit().putString("active", server.id).apply()
        openServer(server)
    }

    private fun showServerPicker() {
        activeServer = null
        webView?.destroy(); webView = null
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(32), dp(24), dp(24)); setBackgroundColor(Color.rgb(5, 3, 8))
        }
        root.addView(TextView(this).apply { text = "NEXORA 3.0"; textSize = 13f; setTextColor(Color.rgb(178, 116, 255)) })
        root.addView(TextView(this).apply { text = "Выберите сервер"; textSize = 30f; setTextColor(Color.WHITE); setPadding(0, dp(6), 0, dp(4)) })
        root.addView(TextView(this).apply { text = "HTTPS обязателен. Для локального сервера установите его CA-сертификат в Android."; textSize = 14f; setTextColor(Color.rgb(180, 173, 190)); setPadding(0, 0, 0, dp(18)) })
        val input = EditText(this).apply {
            hint = "https://192.168.1.20:3443"; setTextColor(Color.WHITE); setHintTextColor(Color.rgb(125, 116, 135)); setSingleLine(true)
        }
        root.addView(input, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(actionButton("Подключиться") {
            runCatching { normalizedServer(input.text.toString()) }.onSuccess(::saveAndOpen).onFailure { toast(it.message ?: "Некорректный адрес") }
        })
        val servers = loadServers()
        if (servers.isNotEmpty()) root.addView(sectionTitle("Сохранённые серверы"))
        servers.forEach { server ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            row.addView(actionButton(server.url) { saveAndOpen(server) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(actionButton("Удалить") {
                CookieManager.getInstance().setCookie(server.url, "nexora_session=; Max-Age=0; Secure; HttpOnly; SameSite=Strict")
                CookieManager.getInstance().flush()
                saveServers(loadServers().filterNot { it.id == server.id })
                if (preferences.getString("active", null) == server.id) preferences.edit().remove("active").apply()
                showServerPicker()
            })
            root.addView(row)
        }
        val scroll = ScrollView(this).apply { addView(root) }
        setContentView(scroll)
    }

    private fun openServer(server: Server) {
        activeServer = server
        preferences.edit().putString("active", server.id).apply()
        webView?.destroy()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.rgb(5, 3, 8)) }
        val toolbar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(12), dp(6), dp(8), dp(6)); setBackgroundColor(Color.rgb(8, 5, 13)) }
        toolbar.addView(TextView(this).apply { text = server.label; textSize = 16f; setTextColor(Color.WHITE) }, LinearLayout.LayoutParams(0, dp(44), 1f))
        toolbar.addView(actionButton("Серверы") { showServerPicker() })
        root.addView(toolbar)

        val browser = WebView(this)
        webView = browser
        configureWebView(browser, server)
        root.addView(browser, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
        browser.loadUrl(server.url)
    }

    private fun configureWebView(browser: WebView, server: Server) {
        browser.setBackgroundColor(Color.rgb(5, 3, 8))
        browser.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = false
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            mediaPlaybackRequiresUserGesture = true
            safeBrowsingEnabled = true
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(browser, false)
        }
        browser.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val target = request.url
                if (sameOrigin(server.url, target)) return false
                if (target.scheme == "https") startActivity(Intent(Intent.ACTION_VIEW, target))
                return true
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                handler.cancel()
                toast("Сертификат сервера не принят Android. Установите CA и повторите подключение.")
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                view.destroy(); webView = null
                toast("WebView перезапущен после сбоя")
                showServerPicker()
                return true
            }
        }
        browser.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(webView: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileChooser?.onReceiveValue(null)
                fileChooser = callback
                return runCatching { startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST); true }.getOrElse {
                    fileChooser = null; toast("Не удалось открыть выбор файла"); false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val originAllowed = activeServer?.let { sameOrigin(it.url, request.origin) } == true
                    val audioOnly = request.resources.isNotEmpty() && request.resources.all { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }
                    if (!originAllowed || !audioOnly) return@runOnUiThread request.deny()
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) request.grant(request.resources)
                    else {
                        pendingAudioRequest?.deny()
                        pendingAudioRequest = request
                        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), AUDIO_PERMISSION_REQUEST)
                    }
                }
            }
        }
        browser.setDownloadListener { url, userAgent, disposition, mimeType, _ -> enqueueDownload(url, userAgent, disposition, mimeType) }
    }

    private fun sameOrigin(base: String, target: Uri): Boolean = runCatching {
        val expected = URI(base)
        val targetPort = if (target.port == -1) 443 else target.port
        val expectedPort = if (expected.port == -1) 443 else expected.port
        target.scheme.equals("https", true) && target.host.equals(expected.host, true) && targetPort == expectedPort
    }.getOrDefault(false)

    private fun enqueueDownload(url: String, userAgent: String?, disposition: String?, mimeType: String?) {
        val server = activeServer ?: return
        if (!sameOrigin(server.url, Uri.parse(url))) return toast("Загрузка с внешнего адреса заблокирована")
        val filename = URLUtil.guessFileName(url, disposition, mimeType).replace(Regex("[\\/\\u0000-\\u001f]"), "_")
        val request = DownloadManager.Request(Uri.parse(url)).setTitle(filename).setMimeType(mimeType).setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, filename)
        CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
        userAgent?.let { request.addRequestHeader("User-Agent", it) }
        (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        toast("Файл добавлен в загрузки Nexora")
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST) {
            fileChooser?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileChooser = null
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == AUDIO_PERMISSION_REQUEST) {
            val request = pendingAudioRequest; pendingAudioRequest = null
            request?.let { pending ->
                if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) pending.grant(pending.resources) else pending.deny()
            }
        }
    }

    override fun onBackPressed() {
        val browser = webView
        when { browser?.canGoBack() == true -> browser.goBack(); browser != null -> showServerPicker(); else -> super.onBackPressed() }
    }

    override fun onDestroy() {
        pendingAudioRequest?.deny(); pendingAudioRequest = null
        webView?.apply { stopLoading(); loadUrl("about:blank"); clearHistory(); removeAllViews(); destroy() }
        webView = null
        super.onDestroy()
    }

    private fun actionButton(label: String, action: () -> Unit) = Button(this).apply {
        text = label; isAllCaps = false; setTextColor(Color.WHITE); setBackgroundColor(Color.rgb(70, 35, 105)); setOnClickListener { action() }
    }
    private fun sectionTitle(label: String) = TextView(this).apply { text = label; textSize = 13f; setTextColor(Color.rgb(178, 116, 255)); setPadding(0, dp(24), 0, dp(8)) }
    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val FILE_CHOOSER_REQUEST = 4101
        private const val AUDIO_PERMISSION_REQUEST = 4102
    }
}
