/*siebelapp.js: EXPERIMENTAL app on Siebel inbound REST API
* This is a PoC for a no-frills web app that uses JavaScript/jQuery
* to connect to the Siebel CRM inbound REST API
* uses the /data and /service API
* 
* This version of siebelapp.js uses shoelace
*
* Feel free to improve and remember:
* THIS IS AN EDUCATIONAL SAMPLE!!! DO NOT USE IN PRODUCTION!!!
* (c) 2021-2023 Alexander Hansal, blacksheep IT consulting
*/

/*DEPENDENCIES:
* Add EAILOVService/GetListOfValues to Business Service Access list
*/

//keep the Authorization string after login
var BCRM_BASIC_AUTH = "";

//example data model
//must have knowledge of Siebel BO/BC and fields
//extend "Base" integration objects if needed
//we could store this model anywhere, e.g. in a separate file, in a db etc
var BCRM_MODEL = {
    "Account": {  //app-internal name of the object
        type: "data",  //REST API type (data or service)
        bo: "Account",  //Business Object
        bc: "Account",  //Business Component
        fields: {  //Field list to be included in &fields parameter
            "Name": {  //BC Field name (note: Field names with # might not work)
                edit: true  //is the field editable?
            },
            "Location": {
                edit: true
            },
            "Account Status": {
                label: "Status",  //label for UI display, could use RR inspection service, could be translated
                edit: true,
                lov_type: "ACCOUNT_STATUS",  //lov_type is used to fetch LOVs after successful login (async call)
                badge: {
                    map: {
                        "Active":"success",
                        "Inactive":"danger"
                    }
                }
            },
            "Primary Account City": {
                label: "City"
            },
            "Primary Account Street Address": {
                label: "Street Address"
            },
            "Primary Account Postal Code": {
                label: "Postal Code"
            },
            "Primary Account State": {
                label: "State"
            },
            "Primary Account Country": {
                label: "Country"
            },
            "Last Update - SDQ": {
                label: "Last Update"
            }
        },
        sortspec: "Last Update - SDQ:desc"  //sort spec
    },
    "Contact": {
        type: "data",
        bo: "Contact",
        bc: "Contact",
        fields: {
            "Last Name": {
                edit: true
            },
            "First Name": {
                edit: true
            },
            "M/M": {
                label: "Salutation",
                edit: true,
                lov_type: "MR_MS"
            },
            "Email Address": {},
            "Primary Account Name": {
                label: "Account"
            },
            "Last Update - SDQ": {
                label: "Last Update"
            }
        },
        sortspec: "Last Update - SDQ:desc"
    },
    "Lead": {
        type: "data",
        bo: "Opportunity",
        bc: "Opportunity",
        fields: {
            "Name": {
                edit: true
            },
            "Account": {},
            "Primary Revenue Amount":{
                label: "Revenue",
                edit:true
            },
            "Primary Revenue Win Probability":{
                label: "Prob %",
                edit: true
            },
            "Primary Revenue Close Date":{
                label: "Close Date",
                edit:true
            },
            "Quality": {
                label: "Quality",
                edit: true,
                lov_type: "LEAD_QUALITY",
                badge:{
                    map:{
                        "1-Excellent":"success",
                        "2-Very High":"success",
                        "3-High":"primary",
                        "4-Fair":"warning",
                        "5-Poor":"danger"
                    }
                }
            }
        },
        sortspec: "Primary Revenue Amount:desc"
    },
    "Authorization": {
        type: "data",
        bo: "Contact",
        bc: "Contact",
        fields: {
            "Last Name": {},
            "First Name": {}
        },
        viewmode: "Organization"  //override default view mode, see REST API Guide for valid values
    },
    "defaults": {
        pagesize: 100,  //maximum 100
        viewmode: "Sales Rep",  //"My"
        searchspec: "[Id] IS NOT NULL",  //dummy searchspec
        sortspec: "Updated:desc"  //Note: Updated field is not exposed in vanilla Base IOs
    }
}

//remove all records
BCRMCleanUp = function () {
    $("#appcontent").find("*").remove();
};

//beautify record container
//here we can improve UX, e.g. by adding links or formatting
BCRMBeautify = function (rc) {
    //email example
    rc.find(".field-container[bcrm-field*='Email'").each(function (x) {
        var m = $(this).find(".field-value").text();
        m = "<a href='mailto:" + m + "'>" + m + "</a>";
        $(this).find(".field-value").html(m);
    });
};

//clear all forms
BCRMClearForms = function () {
    $(".edit-input,.edit-select").each(function (x) {
        var oval = $(this).parent().attr("bcrm-ovalue");
        $(this).parent().append("<span>" + oval + "</span>");
        $(this).remove();
    });
    $(".record-button-container").hide();
    $(".field-container.empty").hide();
    $(".record-container.edit").removeClass("edit");
};

//Upsert record
BCRMUpsert = function (opt, bdy) {
    var ret = {};
    //generate URL
    //requires index.html to be hosted on Siebel AI
    var url = location.origin;
    url += "/" + "siebel/v1.0/" + "data" + "/";
    url += opt.bo + "/" + opt.bc;

    //synchronous XHR
    //TODO: support async/fetch etc
    var data = $.ajax({
        dataType: "json",
        url: url,
        async: (opt.async ? opt.async : false),
        data: JSON.stringify(bdy),
        method: "PUT",
        headers: {
            "Authorization": BCRM_BASIC_AUTH,
            "Content-Type": "application/json"
        }
    });

    //return response
    ret.status = data.status;
    ret.data = data.responseJSON;
    return ret;
};

//get data for an object in the data model
var BCRM_PENDING_CHANGES = false;
BCRMShowData = function (obj, cleanup) {
    if (typeof (cleanup) === "undefined" || cleanup == true) {
        BCRMCleanUp();
    }
    //set object name as attribute
    $("#appcontainer").attr("data-obj", obj);

    //call REST API
    var data = BCRMQuery(BCRM_MODEL[obj]);

    //create record display
    //TODO: smarten up
    if (data.status == 200) {

        //for each record
        for (i in data.data.items) {
            var r = data.data.items[i];
            var fs = data.fields;
            //var rc = $("<div id='" + r.Id.replace(":", "-") + "' class='record-container'></div>");
            var rc = $("<sl-card id='" + r.Id.replace(":", "-") + "' class='record-container'></sl-card>");
            var badgec = $("<div class='badge-container'>");
            rc.append(badgec);
            //record buttons
            var btc = $("<div class='record-button-container'></div>");
            var ebtn = $("<sl-button size='small' pill class='edit-button' style='display:none;'>Edit</sl-button>");
            var sbtn = $("<sl-button size='small' pill class='save-button' style='display:none;' disabled>Save</sl-button>");
            var cbtn = $("<sl-button size='small' pill class='cancel-button' style='display:none;'>Cancel</sl-button>");

            //Edit button
            ebtn.on("click", function (e) {
                //reset all forms
                BCRMClearForms();
                var rc = $(this).parent().parent();
                rc.addClass("edit");
                rc.find(".field-container").each(function (x) {
                    $(this).show();
                    var fld = $(this).attr("bcrm-field").split(".")[1];
                    var fv = $(this).find(".field-value");
                    var rc = $(this).parent();
                    if (fs[fld].edit) {
                        var oval = fv.text();
                        var ihtml = "<sl-input type='text' class='edit-input' value='" + oval + "'></sl-input>";
                        fv.attr("bcrm-ovalue", oval);
                        fv.find("span").remove();


                        //lov demo
                        //lovs should have been loaded to model via async service call

                        if (typeof (fs[fld].lov) !== "undefined") {
                            ihtml = "<sl-select class='edit-select' value='" + oval +"'>";
                            for (var i = 0; i < fs[fld].lov.length; i++) {
                                ihtml += "<sl-option value='" + fs[fld].lov[i] + "'>" + fs[fld].lov[i] + "</sl-option>";
                            }
                            ihtml += "</sl-select>";
                        }

                        fv.html(ihtml);

                        fv.find(".edit-input").on("keyup", function () {
                            BCRM_PENDING_CHANGES = false;
                            rc.find(".edit-input").each(function (x) {
                                var oval = $(this).parent().attr("bcrm-ovalue");
                                if ($(this).val() != oval) {
                                    BCRM_PENDING_CHANGES = true;
                                }
                            });
                            if (BCRM_PENDING_CHANGES) {
                                rc.find(".save-button").removeAttr("disabled");
                            }
                            else {
                                rc.find(".save-button").attr("disabled", "disabled");
                            }
                        });

                        fv.find(".edit-select").on("sl-change", function () {
                            BCRM_PENDING_CHANGES = false;
                            rc.find(".edit-select").each(function (x) {
                                var oval = $(this).parent().attr("bcrm-ovalue");
                                if ($(this).val() != oval) {
                                    BCRM_PENDING_CHANGES = true;
                                }
                            });
                            if (BCRM_PENDING_CHANGES) {
                                rc.find(".save-button").removeAttr("disabled");
                            }
                            else {
                                rc.find(".save-button").attr("disabled", "disabled");
                            }
                        });
                    }
                });
                $(this).hide();
                rc.find(".record-button-container").show();
                rc.find(".save-button").show();
                rc.find(".cancel-button").show();
                rc.find(".field-container").addClass("edit");
            });

            //Cancel/Close button
            cbtn.on("click", function (e) {
                BCRMClearForms();
                var rc = $(this).parent().parent();
                rc.find(".record-button-container").show();
                $(this).hide();
                rc.find(".save-button").hide();
                rc.find(".edit-button").show();
                var fc = rc.find(".field-container");
                fc.removeClass("edit");
                fc.each(function (x) {
                    if ($(this).attr("bcrm-value") == "") {
                        $(this).addClass("emtpy");
                    }
                });
            });

            //Save button
            sbtn.on("click", function (e) {
                var rc = $(this).parent().parent();
                var row_id = rc.attr("id");
                var bdy = {
                    "Id": row_id
                };
                var send = false;
                rc.find(".edit-input,.edit-select").each(function (x) {
                    var oval = $(this).parent().attr("bcrm-ovalue");
                    var fc = $(this).parent().parent();
                    var obj = fc.attr("bcrm-field").split(".")[0];
                    var fld = fc.attr("bcrm-field").split(".")[1];
                    if ($(this).val() != oval) {
                        bdy[fld] = $(this).val();
                        send = true;
                    }
                });
                if (send) {
                    var result = BCRMUpsert(BCRM_MODEL[obj], bdy);
                    //var color = "lightgreen";
                    if (result.status != 200) {
                        //color = "coral";
                        //alert(result.data.ERROR);
                        $("#save_error").find(".sv-err-msg").text(result.data.ERROR);
                        $("#save_error")[0].open = true;
                        setTimeout(function () {
                            $("#save_error")[0].open = false;
                        }, 5000);
                    }
                    else {
                        for (f in bdy) {
                            var fc = rc.find(".field-container[bcrm-field='" + obj + "." + f + "']");
                            fc.attr("bcrm-value", bdy[f].replace(/\W/g, "").substring(0, 30));
                            fc.find(".field-value").attr("bcrm-ovalue", bdy[f]);
                        }
                        rc.find(".cancel-button").text("Close");
                        //rc.find(".save-button").css("background", color);
                        $("#save_success")[0].open = true;
                        setTimeout(function () {
                            $("#save_success")[0].open = false;
                        }, 2000);
                    }
                }
            });

            btc.append(ebtn);
            btc.append(sbtn);
            btc.append(cbtn);

            //for each field
            var fcount = 0;
            for (f in fs) {
                var val = r[f];
                //create badge
                if (fs[f].badge){
                    var bc = $("<sl-badge variant='" + fs[f].badge.map[val] +"' pill>" + val + "</sl-badge>");
                    badgec.append(bc);
                }
                //create field container
                var fc = $("<div class='field-container'></div>");
                if (fs[f].badge){
                    fc.addClass("badge");
                }
                //add object name.field name and value for conditional CSS
                fc.attr("bcrm-field", obj + "." + f);
                fc.attr("bcrm-value", val.replace(/\W/g, "").substring(0, 30));

                //label and value containers
                var lc = $("<div class='field-label' style='display:none;'><span>" + (fs[f].label ? fs[f].label : f) + ":</span></div>");
                var vc = $("<div class='field-value'><span>" + val + "</span></div>");

                //hide empty fields in read-only display
                if (val == "") {
                    fc.addClass("empty");
                }
                //stack
                fc.append(lc);
                fc.append(vc);
                if (fcount == 0) {
                    rc.prepend(fc);
                }
                else {
                    rc.append(fc);
                }
                fcount++;

            }//end for each field

            //click/tap handler on record container
            rc.on("click", function (e) {
                if (!$(this).hasClass("active")) {
                    //clear forms
                    BCRMClearForms();

                    //hide all visible labels
                    $(".field-label").hide();

                    //show labels for current record
                    $(this).find(".field-label").show();

                    //set active class
                    $(".record-container[class*='active']").removeClass("active");
                    $(this).addClass("active");

                    //show record buttons (edit only)
                    $(this).find(".card__footer").show();
                    $(this).find(".record-button-container").show();
                    $(this).find(".edit-button").show();
                    $(this).find(".save-button").hide();
                    $(this).find(".cancel-button").hide();

                    $(".field-container").removeClass("edit");
                }
            });

            rc.append(btc);

            //beautify record container
            BCRMBeautify(rc);

            $("#appcontent").append(rc);


        }//end for each record

    }
    else {
        $("#message").text("No records");
    }
};

//body onload function
LoadApp = function () {
    $("#appcontainer").show();
    $("#search").hide();
    //bind events
    const logindialog = document.querySelector('.dialog-login');
    const login_btn = document.getElementById('loginbtn');
    const ld_submit_btn = logindialog.querySelector('sl-button[slot="footer"]');
    ld_submit_btn.addEventListener('click', () => {
        logindialog.hide();
        BCRMGetCredentials();
    });
    login_btn.addEventListener('click', () => logindialog.show());

    $("sl-button.tab").on("click", function (e) {
        $("button.tab.active").removeClass("active");
        $(this).addClass("active");
        $("#message").text(sessionStorage.BCRM_SALUTATION);
        BCRMShowData($(this).attr("id"));
        $("#search").show();
    });
    $("#searchbtn").on("click", function (e) {
        BCRMSearch();
    });
    $("#searchval").on("keyup", function (e) {
        if (e.keyCode == 13) {
            BCRMSearch();
        }
    });
};

//execute search
BCRMSearch = function () {
    $("#message").text(sessionStorage.BCRM_SALUTATION);
    var obj = $("#appcontainer").attr("data-obj");
    var fs = BCRM_MODEL[obj].fields;
    var fa = [];
    for (f in fs) {
        fa.push(f);
    }
    var s = $("#searchval").val();
    if (s != "") {
        //default to "case insensitive contains in first two fields"
        //TODO: smarten up
        BCRM_MODEL[obj].searchspec = "[" + fa[0] + "] ~LIKE'*" + s + "*' OR [" + fa[1] + "] ~LIKE'*" + s + "*'";
        BCRMShowData(obj);
    }
    else {
        BCRM_MODEL[obj].searchspec = BCRM_MODEL.defaults.searchspec;
        BCRMShowData(obj);
    }
};

//Query
BCRMQuery = function (opt) {
    $(".spinner").show();
    var fs = opt.fields;
    var fa = [];
    for (f in fs) {
        fa.push(f);
    }
    var fields = fa.join(",");
    var ret = {};
    //generate URL
    //requires index.html to be hosted on Siebel AI
    var url = location.origin;
    url += "/" + "siebel/v1.0/" + opt.type + "/";
    url += opt.bo + "/" + opt.bc + "?";
    url += "childlinks=" + (opt.childlinks ? opt.childlinks : "none");
    url += "&" + "fields=" + (fields ? fields : "Id");
    url += "&" + "searchspec=" + (opt.searchspec ? opt.searchspec : BCRM_MODEL.defaults.searchspec);
    url += "&" + "ViewMode=" + (opt.viewmode ? opt.viewmode : BCRM_MODEL.defaults.viewmode);
    url += "&" + "uniformresponse=" + (opt.uniformresponse ? opt.uniformresponse : "Y");
    url += "&" + "PageSize=" + (opt.pagesize ? opt.pagesize : BCRM_MODEL.defaults.pagesize);
    url += "&" + "sortspec=" + (opt.sortspec ? opt.sortspec : BCRM_MODEL.defaults.sortspec);

    var data = $.ajax({
        dataType: "json",
        url: url,
        async: (opt.async ? opt.async : false),
        method: (opt.verb ? opt.verb : "GET"),
        headers: {
            "Authorization": BCRM_BASIC_AUTH
        }
    });

    //return response
    ret.status = data.status;
    ret.data = data.responseJSON;
    ret.fields = (opt.fields ? opt.fields : { "Id": {} });
    $(".spinner").hide();
    return ret;
};

//Validate user
BCRMGetCredentials = function (next) {
    const logindialog = document.querySelector('.dialog-login');
    const un = logindialog.querySelector('sl-input[type="text"]').value;
    const pw = logindialog.querySelector('sl-input[type="password"]').value;
    BCRM_BASIC_AUTH = "Basic " + btoa(un + ":" + pw);
    BCRM_MODEL["Authorization"].searchspec = "[Login Name]='" + un + "'";
    var data = BCRMQuery(BCRM_MODEL["Authorization"]);
    if (data.status == 200) {
        sessionStorage.BCRM_SALUTATION = "Welcome " + data.data.items[0]["First Name"] + " " + data.data.items[0]["Last Name"];
        $("#message").text(sessionStorage.BCRM_SALUTATION);
        $("#loginbtn").hide();
        $("#login_msg").hide();
        $("#login_error").hide();
        $("sl-button.tab").show();

        //lazy load LOVs
        try {
            BCRMGetLOVs();
        }
        catch (e) {
            console.error("Could not retrieve LOVs", e.toString());
        }
    }
    else {
        $("#login_msg").hide();
        $("#login_error")[0].open = true;
    }
}

//Process the outputs of business service calls
BCRMProcessOutputs = function (service, method, outputs) {
    outputs = JSON.parse(outputs);

    if (service == "EAILOVService") {
        //add lovs to model
        var lov_types = outputs.ListsTopElementResult.List;
        for (m in BCRM_MODEL) {
            var obj = BCRM_MODEL[m];
            for (f in obj.fields) {
                var fld = obj.fields[f];
                if (typeof (fld.lov_type) !== "undefined") {
                    fld.lov = [];
                    for (var i = 0; i < lov_types.length; i++) {
                        if (fld.lov_type == lov_types[i].Type) {
                            var lov_values = lov_types[i]["List Value"];
                            for (var j = 0; j < lov_values.length; j++) {
                                fld.lov.push(lov_values[j]["Display Value"]);
                            }
                        }
                    }
                }
            }
        }
    }
};

//Get List of Values from Siebel
BCRMGetLOVs = function (lov_types) {
    //default: read lov_types from model
    if (typeof (lov_types) === "undefined") {
        lov_types = [];
        for (m in BCRM_MODEL) {
            var obj = BCRM_MODEL[m];
            for (f in obj.fields) {
                var fld = obj.fields[f];
                if (typeof (fld.lov_type) !== "undefined") {
                    lov_types.push(fld.lov_type);
                }
            }
        }
    }
    var qlist = [];
    for (var i = 0; i < lov_types.length; i++) {
        qlist.push({
            "Active": "Y",
            "Language Code": "ENU",
            "Type": lov_types[i]
        });
    }
    var inputs = {
        "body": {
            "ListsTopElementQuery": {
                "MessageId": "",
                "MessageType": "Integration Object",
                "IntObjectName": "List Query",
                "IntObjectFormat": "Siebel Hierarchical",
                "ListOfList Query": {
                    "List": qlist
                }
            }
        }
    };
    if (qlist.length > 0) {
        //call service via Siebel REST API
        BCRMCallService("EAILOVService", "GetListOfValues", inputs, true);
    }
    else {
        console.log("No LOV types specified. Nothing to do.");
    }
};

//Call business services
BCRMCallService = function (service, method, inputs, async) {
    //default to async
    //we only do async/fetch at this point
    if (typeof (async) === "undefined") {
        async = true;
    }
    var hdr = new Headers();
    hdr.append("Content-Type", "application/json");
    hdr.append("Authorization", BCRM_BASIC_AUTH);

    var opt = {
        method: 'POST',
        headers: hdr,
        body: JSON.stringify(inputs),
        redirect: 'follow'
    };

    var url = location.origin;
    url += "/" + "siebel/v1.0/" + "service" + "/";
    url += service + "/";
    url += method + "/";
    url += "?uniformresponse=Y";

    fetch(url, opt)
        .then(response => response.text())
        .then(result => BCRMProcessOutputs(service, method, result))
        .catch(error => console.log('error', error));
};
console.log("siebelapp.js loaded");