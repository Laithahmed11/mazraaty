package com.mazraaty.push;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import com.google.firebase.messaging.*;
import java.util.Map;

/** Data-only messages let logout invalidate even messages already in transit. */
public final class BookingMessagingService extends FirebaseMessagingService {
 @Override public void onMessageReceived(RemoteMessage message){
  Map<String,String> data=message.getData();SharedPreferences prefs=getSharedPreferences("push",MODE_PRIVATE);long now=System.currentTimeMillis()/1000;
  boolean owner=getPackageName().endsWith(".owner");
  if(!prefs.getBoolean("enabled",false)||prefs.getLong("expires",0)<=now||!prefs.getString("binding","").equals(data.get("binding"))||!(owner?"owner":"customer").equals(data.get("role")))return;
  try{if(Long.parseLong(data.get("expires"))<=now)return;}catch(Exception e){return;}
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
  boolean offer="offer".equals(data.get("kind"));if(offer&&(owner||!prefs.getBoolean("marketing",false)))return;
  String id=data.get("bookingId");if(!offer&&(id==null||!id.matches("[a-zA-Z0-9-]{1,80}")))return;if(offer)id=data.get("eventId");if(id==null)return;
  String kind=data.get("kind"),body;
  if("new".equals(kind))body="وصل طلب حجز جديد. افتح التطبيق لمراجعته.";
  else if("confirmed".equals(kind))body="تم تأكيد حجزك. افتح التطبيق للتفاصيل.";
  else if("rejected".equals(kind))body="لم تتم الموافقة على طلب الحجز. راجع التطبيق.";
  else if("cancelled".equals(kind))body="تم إلغاء حجز. افتح التطبيق للتفاصيل.";
  else if("reminder".equals(kind))body="موعد حجزك قريب. راجع تفاصيل طلعتك.";
  else if(offer){body=data.get("body");if(body==null||body.length()>300)return;}
  else return;
  Intent intent=getPackageManager().getLaunchIntentForPackage(getPackageName());if(intent==null)return;
  if(!offer)intent.putExtra("booking_id",id);intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
  PendingIntent open=PendingIntent.getActivity(this,id.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  PushBridge.channel(this);
  Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,PushBridge.CHANNEL):new Notification.Builder(this);
  builder.setSmallIcon(getResources().getIdentifier("ic_notification","drawable",getPackageName())).setContentTitle(offer&&data.get("title")!=null?data.get("title").substring(0,Math.min(80,data.get("title").length())):"مزرعتي").setContentText(body).setContentIntent(open).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE);
  getSystemService(NotificationManager.class).notify((data.get("eventId")+"").hashCode(),builder.build());
 }
 @Override public void onNewToken(String token){/* The foreground origin bridge re-registers token under the current session. */}
}
