package com.heywood8.monkeep

import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class GooglePayNotificationListener : NotificationListenerService() {

    companion object {
        private const val GOOGLE_PAY_PACKAGE = "com.google.android.apps.walletnfcrel"
        private const val EVENT_NAME = "GooglePayNotification"
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)

        if (sbn == null) return

        // Only process Google Pay notifications
        if (sbn.packageName != GOOGLE_PAY_PACKAGE) return

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        // Extract notification data
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""
        val timestamp = sbn.postTime

        // Skip if not a payment notification (basic filtering)
        if (!isPaymentNotification(title, text, bigText)) {
            return
        }

        // Send to React Native
        sendNotificationToReactNative(title, text, bigText, timestamp)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
    }

    private fun isPaymentNotification(title: String, text: String, bigText: String): Boolean {
        val content = "$title $text $bigText".lowercase()

        // Look for payment-related keywords
        val paymentKeywords = listOf(
            "paid",
            "payment",
            "transaction",
            "purchase",
            "spent",
            "charged",
            "debited",
            "₹", "$", "€", "£", "¥", // Currency symbols
        )

        return paymentKeywords.any { keyword -> content.contains(keyword) }
    }

    private fun sendNotificationToReactNative(
        title: String,
        text: String,
        bigText: String,
        timestamp: Long
    ) {
        try {
            val reactContext = GooglePayNotificationModule.reactContext ?: return

            val params = Arguments.createMap().apply {
                putString("title", title)
                putString("text", text)
                putString("bigText", bigText)
                putDouble("timestamp", timestamp.toDouble())
            }

            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_NAME, params)
        } catch (e: Exception) {
            // Silent fail - React Native might not be ready
        }
    }
}
