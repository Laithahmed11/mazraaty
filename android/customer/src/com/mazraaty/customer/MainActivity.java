package com.mazraaty.customer;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.*;
import android.widget.*;
import android.view.View;
import java.io.ByteArrayInputStream;
import java.util.HashMap;

/** Test build. Shared data is stored on the HTTPS service, never in Wix. */
public class MainActivity extends Activity {
 private static final String HOST="mazraaty-iraq.higgsfield.app";
 private static final String START_PATH="/customer";
 private static final boolean OWNER=false;
 private static final int PICK_IMAGE=410;
 private WebView web;private FrameLayout frame;private LinearLayout failure;
 private ValueCallback<Uri[]> fileCallback;private boolean failed;
 @Override public void onCreate(Bundle state){
  super.onCreate(state);getWindow().setStatusBarColor(Color.rgb(243,245,250));getWindow().setNavigationBarColor(Color.rgb(243,245,250));
  frame=new FrameLayout(this);frame.setBackgroundColor(Color.rgb(243,245,250));
  frame.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i.consumeSystemWindowInsets();});
  web=new WebView(this);web.setBackgroundColor(Color.rgb(243,245,250));frame.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(frame);frame.requestApplyInsets();
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(OWNER);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);s.setMediaPlaybackRequiresUserGesture(true);s.setCacheMode(WebSettings.LOAD_NO_CACHE);if(Build.VERSION.SDK_INT>=26)s.setSafeBrowsingEnabled(true);
  CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);WebView.setWebContentsDebuggingEnabled(false);
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return allowed(r.getUrl())?null:denied();}
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,String url){return allowed(Uri.parse(url))?null:denied();}
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return navigate(r.getUrl());}
   @Override public boolean shouldOverrideUrlLoading(WebView v,String url){return navigate(Uri.parse(url));}
   @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){failed=false;if(failure!=null){frame.removeView(failure);failure=null;}}
   @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())showFailure();}
   @Override public void onReceivedHttpError(WebView v,WebResourceRequest r,WebResourceResponse response){if(r.isForMainFrame()&&response.getStatusCode()>=400)showFailure();}
   @Override public void onReceivedSslError(WebView v,android.webkit.SslErrorHandler handler,android.net.http.SslError error){handler.cancel();showFailure();}
  });
  if(OWNER)web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams p){
    if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=cb;
    Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.addCategory(Intent.CATEGORY_OPENABLE);pick.setType("image/*");pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    try{startActivityForResult(pick,PICK_IMAGE);}catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;Toast.makeText(MainActivity.this,"لا يوجد منتقي صور على الجهاز",Toast.LENGTH_LONG).show();}return true;
   }
  });
  web.loadUrl("https://"+HOST+START_PATH);
 }
 private boolean allowed(Uri uri){return "https".equals(uri.getScheme())&&HOST.equals(uri.getHost())&&(uri.getPort()==-1||uri.getPort()==443)&&(OWNER||!"/owner".equals(uri.getPath()));}
 private WebResourceResponse denied(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",new HashMap<String,String>(),new ByteArrayInputStream(new byte[0]));}
 private boolean navigate(Uri uri){if(allowed(uri))return false;
  if("tel".equals(uri.getScheme())||"mailto".equals(uri.getScheme())){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception e){Toast.makeText(this,"ماكو تطبيق مناسب لهذا الرابط",Toast.LENGTH_SHORT).show();}}
  else{showFailure();}return true;
 }
 private void showFailure(){runOnUiThread(()->{if(failed)return;failed=true;failure=new LinearLayout(this);failure.setOrientation(LinearLayout.VERTICAL);failure.setGravity(android.view.Gravity.CENTER);failure.setPadding(35,35,35,35);failure.setBackgroundColor(Color.rgb(243,245,250));TextView text=new TextView(this);text.setText("تعذر فتح مزرعتي.\nتحقق من الإنترنت. إذا الخدمة تطلب حساب هكسفيلد، تحتاج تفعيل وصول الزبائن على الاستضافة أولاً.");text.setTextSize(18);text.setTextColor(Color.rgb(26,36,64));text.setGravity(android.view.Gravity.CENTER);failure.addView(text);Button retry=new Button(this);retry.setText("حاول مجدداً");retry.setOnClickListener(v->web.loadUrl("https://"+HOST+START_PATH));failure.addView(retry);frame.addView(failure,new FrameLayout.LayoutParams(-1,-1));});}
 @Override protected void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==PICK_IMAGE&&fileCallback!=null){Uri uri=result==RESULT_OK&&data!=null?data.getData():null;fileCallback.onReceiveValue(uri==null?null:new Uri[]{uri});fileCallback=null;}}
 @Override public void onBackPressed(){if(failure!=null){super.onBackPressed();return;}web.evaluateJavascript("(function(){var d=document.querySelector('dialog[open]');if(d){d.dispatchEvent(new Event('cancel',{cancelable:true}));return true;}return false;})()",value->{if("true".equals(value))return;if(web.canGoBack())web.goBack();else MainActivity.super.onBackPressed();});}
 @Override protected void onDestroy(){if(fileCallback!=null){fileCallback.onReceiveValue(null);fileCallback=null;}if(web!=null){web.stopLoading();web.destroy();}super.onDestroy();}
}

