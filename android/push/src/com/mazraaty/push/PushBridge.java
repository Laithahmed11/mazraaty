package com.mazraaty.push;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.WebView;
import androidx.webkit.*;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.Collections;
import java.util.UUID;
import org.json.JSONObject;

/** Main-frame, exact HTTPS origin bridge; never grants access to arbitrary iframes. */
public final class PushBridge {
 public static final String CHANNEL="mazraaty_bookings";
 private final Activity activity;private final String host;private final SharedPreferences prefs;
 private JavaScriptReplyProxy pending;
 public PushBridge(Activity a,WebView web,String h){
  activity=a;host=h;prefs=a.getSharedPreferences("push",Context.MODE_PRIVATE);channel(a);
  if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))return;
  WebViewCompat.addWebMessageListener(web,"MazraatyPush",Collections.singleton("https://"+host),(view,message,origin,main,reply)->{
   if(!main||!"https".equals(origin.getScheme())||!host.equals(origin.getHost())||(origin.getPort()!=-1&&origin.getPort()!=443))return;
   try{JSONObject data=new JSONObject(message.getData());String action=data.optString("action");
    if("clear".equals(action)){clear();send(reply,"cleared",null);return;}
    if("registered".equals(action)){
     if(data.optString("binding").equals(prefs.getString("binding","")))prefs.edit().putLong("expires",data.optLong("expires",0)).putBoolean("marketing",data.optBoolean("marketing",false)).apply();return;
    }
    if("enable".equals(action)){
     if(FirebaseApp.initializeApp(activity)==null){send(reply,"unconfigured",null);return;}
     prefs.edit().putBoolean("enabled",true).apply();
     if(Build.VERSION.SDK_INT>=33&&activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){pending=reply;activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},411);return;}
    }else if(!"status".equals(action))return;
    token(reply);
   }catch(Exception ignored){send(reply,"error",null);}
  });
 }
 private void token(JavaScriptReplyProxy reply){
  if(!prefs.getBoolean("enabled",false)){send(reply,"disabled",null);return;}
  if((Build.VERSION.SDK_INT>=33&&activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)||(Build.VERSION.SDK_INT>=24&&!activity.getSystemService(NotificationManager.class).areNotificationsEnabled())){clear();send(reply,"denied",null);return;}
  if(FirebaseApp.initializeApp(activity)==null){send(reply,"unconfigured",null);return;}
  FirebaseMessaging.getInstance().setAutoInitEnabled(true);
  FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task->{if(!task.isSuccessful()){send(reply,"error",null);return;}
   String binding=prefs.getString("binding","");if(binding.isEmpty()){binding=UUID.randomUUID().toString();prefs.edit().putString("binding",binding).apply();}
   try{JSONObject data=new JSONObject();data.put("marketing",prefs.getBoolean("marketing",false));data.put("token",task.getResult());data.put("binding",binding);send(reply,"ready",data);}catch(Exception ignored){send(reply,"error",null);}
  });
 }
 private void send(JavaScriptReplyProxy reply,String status,JSONObject data){activity.runOnUiThread(()->{try{JSONObject out=data==null?new JSONObject():data;out.put("status",status);reply.postMessage(out.toString());}catch(Exception ignored){}});}
 public void permissionResult(){if(pending!=null){JavaScriptReplyProxy reply=pending;pending=null;token(reply);}}
 private void clear(){prefs.edit().remove("binding").remove("expires").remove("marketing").putBoolean("enabled",false).apply();activity.getSystemService(NotificationManager.class).cancelAll();if(!FirebaseApp.getApps(activity).isEmpty()){FirebaseMessaging.getInstance().setAutoInitEnabled(false);FirebaseMessaging.getInstance().deleteToken();}}
 public static void channel(Context c){if(Build.VERSION.SDK_INT>=26)c.getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"الحجوزات",NotificationManager.IMPORTANCE_HIGH));}
}
