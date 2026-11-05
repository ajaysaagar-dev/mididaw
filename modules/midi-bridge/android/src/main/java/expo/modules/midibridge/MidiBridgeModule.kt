package expo.modules.midibridge

import android.content.Context
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiInputPort
import android.media.midi.MidiManager
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MidiBridgeModule : Module() {
  private var midiManager: MidiManager? = null
  private var currentDevice: MidiDevice? = null
  private var currentInputPort: MidiInputPort? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("MidiBridge")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      midiManager = context.getSystemService(Context.MIDI_SERVICE) as? MidiManager
    }

    Function("getDevices") {
      val manager = midiManager ?: return@Function emptyList<Map<String, Any?>>()
      val devices = manager.devices
      devices.map { info ->
        val props = info.properties
        mapOf(
          "id" to info.id,
          "type" to info.type,
          "isUsb" to (info.type == MidiDeviceInfo.TYPE_USB),
          "name" to (props.getString(MidiDeviceInfo.PROPERTY_NAME) ?: "MIDI Device #${info.id}"),
          "product" to (props.getString(MidiDeviceInfo.PROPERTY_PRODUCT) ?: ""),
          "manufacturer" to (props.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER) ?: ""),
          "inputPorts" to info.inputPortCount,
          "outputPorts" to info.outputPortCount
        )
      }
    }

    AsyncFunction("connectDevice") { deviceId: Int, portIndex: Int ->
      val manager = midiManager ?: return@AsyncFunction false
      val info = manager.devices.find { it.id == deviceId } ?: return@AsyncFunction false
      closeCurrentPort()

      var success = false
      val lock = Object()
      var done = false

      manager.openDevice(info, { device ->
        if (device != null) {
          currentDevice = device
          currentInputPort = device.openInputPort(portIndex)
          success = (currentInputPort != null)
        }
        synchronized(lock) {
          done = true
          lock.notifyAll()
        }
      }, mainHandler)

      synchronized(lock) {
        if (!done) {
          lock.wait(3000)
        }
      }
      return@AsyncFunction success
    }

    AsyncFunction("autoConnectUsb") {
      val manager = midiManager ?: return@AsyncFunction false
      val devices = manager.devices
      // Look for USB devices first, then any available MIDI device with an input port
      val usbDevice = devices.firstOrNull { it.type == MidiDeviceInfo.TYPE_USB && it.inputPortCount > 0 }
        ?: devices.firstOrNull { it.inputPortCount > 0 }

      if (usbDevice == null) {
        return@AsyncFunction false
      }

      closeCurrentPort()
      var success = false
      val lock = Object()
      var done = false

      manager.openDevice(usbDevice, { device ->
        if (device != null) {
          currentDevice = device
          currentInputPort = device.openInputPort(0)
          success = (currentInputPort != null)
        }
        synchronized(lock) {
          done = true
          lock.notifyAll()
        }
      }, mainHandler)

      synchronized(lock) {
        if (!done) {
          lock.wait(3000)
        }
      }
      return@AsyncFunction success
    }

    Function("sendMidiBytes") { bytes: List<Int> ->
      val port = currentInputPort ?: return@Function false
      val byteArray = ByteArray(bytes.size) { i -> bytes[i].toByte() }
      try {
        port.send(byteArray, 0, byteArray.size)
        return@Function true
      } catch (_: Exception) {
        return@Function false
      }
    }

    Function("disconnect") {
      closeCurrentPort()
      return@Function true
    }

    Function("isConnected") {
      return@Function (currentInputPort != null)
    }

    OnDestroy {
      closeCurrentPort()
    }
  }

  private fun closeCurrentPort() {
    try {
      currentInputPort?.close()
    } catch (_: Exception) {}
    try {
      currentDevice?.close()
    } catch (_: Exception) {}
    currentInputPort = null
    currentDevice = null
  }
}
