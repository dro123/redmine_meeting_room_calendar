  var start_time_clone = '';
  var end_time_clone = '';
  var allowEdit = false;
  var noQtip = false;
  var draggedEventIsPastDay = false;
  var maxTitleLength = 36;
  var long_time_format = 'HH:mm A';
  var long_date_format = 'MM/DD/YYYY';
  var long_date_format_datepicker = 'mm/dd/yy';
  var eventsJSON = [];

  jQuery(document).ready(function($) {
      if (!window.console)
          console = {
              log : function() {
              }
          };
          
      start_time_clone = $('#start_time option').clone();
      end_time_clone = $('#end_time option').clone();
      
      /*
      Author: shiju@qburst.com
      Description: get events in json format
      */
      getEventsJSON = function(offset) {
          var meeting_room = $('#meeting_rooms').val();
          var meeting_room_query = '';
          if (meeting_room != 'all') {
              meeting_room_query = '&cf_' + fieldIdRoom + '=' + encodeURIComponent(meeting_room);
          }
          var project_id = $('#project_id').val();
          var current_date = window.moment();
          current_date.subtract(14, 'days');    
          var today = current_date.format("YYYY-MM-DD");
          //  selected meeting room
          $.ajax({
              url : baseUrl + '/issues.json',
              dataType : 'json',
              data : 'key=' + api_key + '&project_id=' + project_id + meeting_room_query + '&start_date=' + encodeURIComponent('>=') + today + '&status_id=' + encodeURIComponent('*') + '&limit=' + 100 + '&offset=' + offset,
              beforeSend : function(xhr) {
                  showSpinner();
              },
              success : function(data, textStatus, jqXHR) {
                  console.log('Get JSON success');
                  if (buildEventsJSON(data, data.offset == 0)) {
                      if (data.offset == 0) {
                          $('#calendar').fullCalendar('removeEvents');
                          $('#calendar').fullCalendar('addEventSource', eventsJSON);
                      }

                      $('#calendar').fullCalendar('refetchEvents');
                      $('#calendar').fullCalendar('rerenderEvents');

                      hideSpinner();

                      if (data.total_count > (data.offset + data.limit)) {
                          getEventsJSON(data.offset + data.limit);
                      }
                  }
              },
              error : function(jqXHR, textStatus, errorThrown) {
                  hideSpinner();
                  alert(textStatus + ": " + errorThrown);
              }
          });
          return true;
      };
      /*
      Author: shiju@qburst.com
      Description: build events json for fullcalendar
      */
      var buildEventsJSON = function(eventsRawJSON, clear) {
          window.console.log('Building Meetings JSON');
          var count = eventsRawJSON.issues.length;
          var event = eventsRawJSON.issues;
          if (clear) {
              eventsJSON = [];
          }
          //  events to be rendered on fullcalendar
          // building events json for fullcalendar
          for (var i = 0; i < count; i++) {
              var eventIndexRoom = 0;
              var eventIndexStart = 1;
              var eventIndexEnd = 5;
              if (event[i].custom_fields == undefined) {
                  continue;   
              }
              for (var j = 0; j < event[i].custom_fields.length; j++)
              {
                  if (event[i].custom_fields[j]["id"] == fieldIdRoom)
                      eventIndexRoom = j;
                  if (event[i].custom_fields[j]["id"] == fieldIdStart)
                      eventIndexStart = j;
                  if (event[i].custom_fields[j]["id"] == fieldIdEnd)
                      eventIndexEnd = j;
              }

              var eventClassName = '';
              var event_id = event[i].id;
              var author_name = event[i].author.name;
              var start_time_arr = event[i].custom_fields[eventIndexStart].value.split(':');
              var end_time_arr = event[i].custom_fields[eventIndexEnd].value.split(':');
              var meeting_room = event[i].custom_fields[eventIndexRoom].value;
              var start_time = window.moment(event[i].start_date);
              start_time.hours(start_time_arr[0]);
              start_time.minutes(start_time_arr[1]);
              start_time.seconds(0);
              start_time.milliseconds(0);
              var end_time = window.moment(event[i].due_date);
              end_time.hours(end_time_arr[0]);
              end_time.minutes(end_time_arr[1]);
              end_time.seconds(0);
              end_time.milliseconds(0);
              var assigned_to_id = event[i].author.id;
              if (event[i].assigned_to)
                  assigned_to_id = event[i].assigned_to.id;
              var assigned_to_name = event[i].author.name;
              if (event[i].assigned_to)
                  assigned_to_name = event[i].assigned_to.name;
              var category_id = 0;
              var category_name = '';
              if (event[i].category) {
                  category_id = event[i].category.id;
                  category_name = event[i].category.name;
              }
              var title = event[i].subject;
              if (title.length >= maxTitleLength && maxTitleLength > 0) {
                  title = stripSubject(title, maxTitleLength) + " ...";
              }
              eventClassName = 'category_' + category_id;
              eventClassName = eventClassName + ' tracker_status_' + event[i].status.id;
              eventClassName = eventClassName + ' meeting_room_' + getRoomClass(meeting_room);
              if (isCurrentUser(event[i].author.id, assigned_to_id)) {
                  eventClassName = eventClassName + ' myEvents ' + eventClassName;
              }
              eventsJSON.push({
                  title : title,
                  author : author_name,
                  start : start_time,
                  end : end_time,
                  meeting_room : meeting_room,
                  subject : event[i].subject,
                  event_id : event_id,
                  event_author_id : event[i].author.id,
                  assigned_to_id : assigned_to_id,
                  assigned_to_name : assigned_to_name,
                  category_id: category_id,
                  category_name: category_name,
                  className : eventClassName,
                  cache : true,
                  allDay : false
              });
          }
          return true;
      };
      var getRoomClass = function(meeting_room) {
          var index = all_meeting_rooms.indexOf(meeting_room);
          if (index >= 0) {
              return index + 1;
          }
          
          return 0;
      };
      /*
      Author: shiju@qburst.com
      Description: checking whether event overlaps with exisiting events
      */
      var isOverlapping = function(event_id, meeting_room, eventStart, eventEnd, periodtype, period) {
          var events = $('#calendar').fullCalendar('clientEvents');
          if (events.length == 0) {
              return false;
          }
          
          var start = eventStart.clone();
          var end = eventEnd.clone();
          
          if (periodtype <= 0 || period <= 0) {
              periodtype = 1;
              period = 1;
          }
          
          var overlapping = false;
          
          if (periodtype = 1 && period > 1) {
              if (end.isAfter(start.clone().add(1, 'days'))) {
                  overlapping = true;
              }
          }
          
          while (period > 0 && !overlapping) {
              if (start.isoWeekday() == 6 || start.isoWeekday() == 7) {
                  continue;
              }
              
              for (i in events) {              
                  if (event_id != 0 && events[i].event_id == event_id) {
                      continue;
                  }
                  
                  if (meeting_room != events[i].meeting_room) {
                      continue;
                  }
                  
                  if (events[i].start == undefined || events[i].end == undefined) {
                      continue;
                  } 
                  
                  // start is the same
                  if (start.isSame(events[i].start, 'minutes')) {
                      overlapping = true;
                  // end is the same
                  } else if (end.isSame(events[i].end, 'minutes')) {
                      overlapping = true;
                  // start is before start and end is after end
                  } else if (start.isBefore(events[i].start, 'minutes') && end.isAfter(events[i].end, 'minutes')) {
                      overlapping = true;
                  // start is between start and end (exclusive)
                  } else if (start.isBetween(events[i].start, events[i].end, 'minutes')) {
                      overlapping = true;
                  // end is between start and end (exclusive)
                  } else if (end.isBetween(events[i].start, events[i].end, 'minutes')) {
                      overlapping = true;
                  }
                              
                  if (overlapping == true) {
                      break;
                  }
              }
              
              start.add(periodtype, 'days');
              end.add(periodtype, 'days');
              period--;
          }
          
          return overlapping;
      };
      /*
      Author: shiju@qburst.com
      Description: stripping the subject text to fit into the calendar event and tooltip
      */
      var stripSubject = function(eventsub, limit) {
          var strlen = eventsub.length;
          if (strlen > limit) {
              return eventsub.substr(0, limit); //.repl;
          } else {
              return eventsub;
          }
      };
      /*
      Author: shiju@qburst.com
      Description: checking whether the current user is same as the author of event
      */
      var isCurrentUser = function(event_author_id, event_assigned_to_id) {
          var current_user_id = $('#author_id').val();
          if ((event_author_id == current_user_id) || (event_assigned_to_id == current_user_id) || (user_is_manager == 1)) {
              return true;
          }
          return false;
      };
      /*
      Author: shiju@qburst.com
      Description: checking whether the event start date is past today
      */
      var isPastDay = function(calDate) {
          var current_date = window.moment();
          if (calDate.isBefore(current_date, 'minutes')) {
              if (allow_changing_old_meetings == 1) {
                  return false;
              }
              return true;
          } else {
              return false;
          }
      };
      /*
      Author: shiju@qburst.com
      Description: intialising fullcalendar to render events
      */
      var loadCalendar = function() {          
          var disableDragAndDrop = true;
          if (allow_drag_and_drop == 1)
              disableDragAndDrop = false;
              
          var disableResize = true;
          if (allow_resize == 1)
              disableResize = false;
              
          if (!getEventsJSON(0)) {
              console.log('Failed loading Meeting Calendar');
              return;
          }
          
          console.log('Loading Meeting Calendar');
          $('#calendar').fullCalendar({
              lang: current_lang,
              height: 'auto',
              contentHeight: 'auto',
              allDaySlot : false,
              weekends : false,
              slotEventOverlap : false,
              header : {
                  left : 'today prev next',
                  center : 'title',
                  right : 'month,agendaWeek,agendaDay'
              },
              defaultView : 'agendaWeek',
              editable : true,
              eventStartEditable: !disableDragAndDrop,
              eventDurationEditable: !disableResize,
              minTime : datetime_min,
              maxTime : datetime_max,
              eventRender : function(event, element) {
                  var full_text = '<p>';
                  full_text = full_text + langRoom + ': ' + event.meeting_room + '<br />';
                  full_text = full_text + langAssignedTo + ': ' + event.assigned_to_name + '<br />';
                  full_text = full_text + langBookedBy + ': ' + event.author + '<br />';
                  full_text = full_text + langStartTime + ': ' + event.start.format(long_time_format) + '<br/>';
                  full_text = full_text + langEndTime + ': ' + event.end.format(long_time_format);
                  if (show_categories=='1') {
                      full_text = full_text + '<br/>' + langCategory + ': ' + event.category_name;
                  }
                  if (show_ticket_id=='1') {
                      full_text = full_text + '<br/><a href="' + baseUrl + '/issues/' + event.event_id + '">' + tracker_name + ' #' + event.event_id + '</a>';
                  }
                  full_text = full_text + '</p>';
                  
                  element.qtip({
                      content : {
                          // Set the text and title fot the tooltip
                          text : full_text,
                          title : {
                              text : event.subject // Give the tooltip a title using each elements text
                          }
                      },
                      position : {
                          my : 'bottom center',
                          at: 'top center',
                          target: element,
                          viewport: true,
                          adjust : {
                              method : 'flip' // Keep the tooltip on-screen at all times
                          }
                      },
                      show : {
                          when : 'mouseover',
                          solo : true // Only show one tooltip at a time
                      },
                      hide : {
                          when : 'mouseout',
                          fixed : true // Don't hide tooltip on mouse over
                      },
                      style : {
                          tip : {
                              corner: true
                          }, // Apply a speech bubble tip to the tooltip at the designated tooltip corner
                          width : 330, // Set the tooltip width
                          widget: true,
                          def: false,
                      },
                      events: {
                          show: function(event, api) {
                              if (noQtip) {
                                  event.preventDefault();
                              }
                          }
                      }
                  });
              },
              eventClick : function(calEvent, jsEvent, view) {
                  if ("Anonymous" == $('#user_name').val() || "Anonym" == $('#user_name').val()) {
                      console.log('User not logged in');
                      return false;
                  }
                  
                  if (!user_can_edit) {
                      console.log('User cannot edit tickets of project');
                      return false;
                  }
                  
                  if (!allowEdit) {
                      console.log('Loading not finished');
                      return false;
                  }
                  
                  if (isPastDay(calEvent.end)) {
                      jAlert(langWarningEditPast, langInfo);
                      return false;
                  }
                  
                  var event_author_id = calEvent.event_author_id;
                  if (!(isCurrentUser(event_author_id, calEvent.assigned_to_id))) {
                      console.log('It is an event created by another user');
                      return false;
                  }  
                  
                  $('input:checkbox').removeAttr('checked');
                  $('#selected_meeting_room').val(calEvent.meeting_room);
                  if ($('#meeting_rooms').val() == 'all' && !hide_rooms) {
                      $('#selected_meeting_room_container').show();
                  } else {
                      $('#selected_meeting_room_container').hide();
                  }
                  $('#meeting_date').val(calEvent.start.format(long_date_format));
                  $('#meeting_end_date').val(calEvent.end.format(long_date_format));
                  $('#subject').val(calEvent.subject);
                  $('#event_id').val(calEvent.event_id);
                  $('#start_time').val(calEvent.start.format('HH:mm'));
                  setEndTime();
                  $('#end_time').val(calEvent.end.format('HH:mm'));
                  $('#assigned_to_id').val(calEvent.assigned_to_id);
                  $('#category_id').val(calEvent.category_id);
                  $('.saveMeetingModal').dialog({
                      title : langUpdateEvent,
                      modal : true,
                      resizable : false,
                      draggable : true,
                      width : 450,
                      show : 'blind',
                      hide : 'explode'
                  });
                  $('.saveMeetingModal').dialog('open');
                  $('.recurfield').hide();
                  $('#recur_div').hide();
                  if (user_can_delete) {
                    $('#delete_meeting').show();
                  } else {
                    $('#delete_meeting').hide();
                  }  
                  $('#subject').focus();                
              },
              dayClick : function(date, jsEvent, calEvent) {
                  if ("Anonymous" == $('#user_name').val() || "Anonym" == $('#user_name').val()) {
                      console.log('User not logged in');
                      return false;
                  }
                  
                  if (!user_can_add) {
                      console.log('User cannot add tickets to project');
                      return false;
                  }
                  
                  if (!allowEdit) {
                      console.log('Loading not finished');
                      return false;
                  }

                  if (isPastDay(date)) {
                      jAlert(langWarningCreatePast, langInfo);
                      return false;
                  } 
                  
                  // clear field values
                  $('#event_id').val(0);
                  if ($('#meeting_rooms').val() == 'all' && !hide_rooms) {
                      $('#selected_meeting_room').prop('selectedIndex', 1);
                      $('#selected_meeting_room_container').show();
                  } else {
                      $('#selected_meeting_room').val($('#meeting_rooms').val());
                      $('#selected_meeting_room_container').hide();
                  }
                  $('#meeting_date').val(date.format(long_date_format));
                  $('#meeting_end_date').val(date.format(long_date_format));
                  $('#subject').val(user_last_name);
                  $('#start_time').val('');
                  $('#end_time').val('');
                  $('input:checkbox').removeAttr('checked');
                  $('#start_time').val(date.format('HH:mm'));
                  $('#assigned_to_id').val($('#author_id').val());                          
                  $('#category_id').val(0);
                  $('.saveMeetingModal').dialog({
                      title : langCreateEvent,
                      modal : true,
                      resizable : false,
                      draggable : true,
                      width : 450,
                      show : 'blind',
                      hide : 'explode'
                  });
                  $('.saveMeetingModal').dialog('open');
                  $('.recurfield').show();
                  $('#recur_div').hide();
                  $('#delete_meeting').hide();
                  $('#subject').focus();
                  setEndTime();                  
              },
              eventOverlap: function(stillEvent, movingEvent) {
                  return stillEvent.meeting_room != movingEvent.meeting_room;
              },
              eventDragStart: function( event, jsEvent, ui, view ) {
                  noQtip = true; 
                  return true; 
              },
              eventDragStop: function( event, jsEvent, ui, view )
              {
                  noQtip = false;
                  if (isPastDay(event.start)) {
                      draggedEventIsPastDay = true;
                      return false;
                  }
                  draggedEventIsPastDay = false;
                  return true;
              },
              eventDrop: quickEditEvent,
              eventResizeStart: function( event, jsEvent, ui, view ) {
                  noQtip = true; 
                  return true; 
              },
              eventResizeStop: function( event, jsEvent, ui, view )
              {
                  noQtip = false;
                  if (isPastDay(event.start)) {
                      draggedEventIsPastDay = true;
                      return false;
                  }
                  draggedEventIsPastDay = false;
                  return true;
              },
              eventResize: quickEditEvent
          });
      };
      
      $('#recurCheckbox').click(function() {
          showHiderecurdiv();
      });

      var quickEditEvent = function( event, delta, revertFunc, jsEvent, ui, view )
      {
          if (!event.start.hasTime()) {
              if (revertFunc != null) {
                  revertFunc();
              }
              return false;
          }
          
          if ("Anonymous" == $('#user_name').val() || "Anonym" == $('#user_name').val()) {
              console.log('User not logged in');              
              if (revertFunc != null) {
                  revertFunc();
              }
              return false;
          }          
          
                  
          if (!user_can_edit) {
              console.log('User cannot edit tickets of project');
              if (revertFunc != null) {
                  revertFunc();
              }
              return false;
          }
          
          if (!(isCurrentUser(event.event_author_id, event.assigned_to_id))) {
              console.log('It is an event created by another user');
              if (revertFunc != null) {
                  revertFunc();
              }
              return false;
          }
          
          if (!allow_multiple_days && !event.start.isSame(event.end, 'days')) {
              console.log('Multiple day event is forbidden');
              if (revertFunc != null) {
                  revertFunc();
              }
              return false;
          }
          

          if (isPastDay(event.start) || draggedEventIsPastDay) {
              if (revertFunc != null) {
                  revertFunc();
              }
              jAlert(langWarningEditPast, langInfo);
              return false;
          } 
          
          if (isOverlapping(event.event_id, event.meeting_room, event.start, event.end, 0, 0)) {
              console.log('Overlapping');
              if (revertFunc != null) {
                  revertFunc();
              }
              return false;
          }
          
          console.log('No overlapping');
          console.log('Quick edit - event id ' + event.event_id + ' / ' + event.start.format() + ' - ' + event.end.format());

          var customData = {};
          customData[fieldIdStart] = event.start.format('HH:mm');
          customData[fieldIdEnd] = event.end.format('HH:mm');
          customData[fieldIdRoom] = event.meeting_room;
          var category_id = 0;
          if (show_categories == '1')
              category_id = event.category_id;
          var ajaxData = {
              key: api_key,
              project_id: $('#project_id').val(),
              author_id: event.event_author_id,
              assigned_to_id: event.assigned_to_id,
              category_id: category_id,
              subject: event.subject,
              start_date: event.start.format('YYYY-MM-DD'),
              due_date: event.end.format('YYYY-MM-DD'),
              custom_field_values: customData,
              event_id: event.event_id,
              recur: false,
              periodtype: 0,
              period: 0
          };
          
          $.ajax({
              url: baseUrl + '/' + pluginName + '/update',
              data: ajaxData,
              success: function (data) {
                  reloadCalendar();
              },
              beforeSend : function(xhr) {
                  showSpinner();
              },
              error : function(jqXHR, textStatus, errorThrown) {
                  hideSpinner();
                  revertFunc();
                  alert(textStatus + ": " + errorThrown);
              }
          });
          
          return true;
      };

      /*
      Author: shiju@qburst.com
      Description: toggle show and hide of reccur checkbox
      */
      var showHiderecurdiv = function() {
          if ($('#recurCheckbox').is(':checked')) {
              $('#recur_div').show('blind', {}, 500);
              var checked_value = $('input:radio[name=Week]:checked').val();
          } else {
              $('#recur_div').hide('blind', {}, 500);
              var checked_value = $('input:radio[name=Week]:checked').val();
              checked_value = '';
          }
          return checked_value;
      };
      /*
      Author: shiju@qburst.com
      Description: show spinner
      */
      var showSpinner = function() {
          $('#loading').show();
          allowEdit = false;
      };
      /*
      Author: shiju@qburst.com
      Description: hide spinner
      */
      var hideSpinner = function() {
          $('#loading').hide();
          allowEdit = true;
      };
      /*
      Author: shiju@qburst.com
      Description: reload calendar
      */
      var reloadCalendar = function() {
          if (getEventsJSON(0)) {
              console.log('Reload Calender');
          }
      };

      $('#meeting_rooms').change(function() {
          reloadCalendar();
      });

      $('#project_id').change(function() {
          location.assign(baseUrl + '/' + pluginName + '/' + $('#project_id').val());
      });

      $('#start_time').change(function() {
          setEndTime();
      });

      /*
      Author: shiju@qburst.com
      Description: set end-time wrt the selected start-time
      */
      var setEndTime = function() {
          $('#end_time').empty().append(end_time_clone);
          var start_time_sel_index = '';
          start_time_sel_index = $('#start_time').prop('selectedIndex') - 1;
          for (var j = start_time_sel_index; j >= 0; j--) {
              $('#end_time option:eq(' + j + ')').remove();
          }
          $('#end_time option:eq(1)').prop('selected', true);
          return true;
      };
      /*
      Author: shiju@qburst.com
      Description: validation to avaoid special characters in subject field
      */
      var validate = function() {
          var special_char = /[0-9a-zA-Z',-]+/;
          if (special_char.test($('#subject').val())) {
              return true;
          }
          return false;
      };
      
      /*
      Author: shiju@qburst.com
      Description: create/update event
      */
      $('#delete_meeting').click(function() {
          if ($('#event_id').val() <= 0)
              return false;

          var ajaxData = {
              key: api_key,
              event_id: $('#event_id').val()
          };
          console.log('Deleting');
          $.ajax({
              url : baseUrl + '/' + pluginName + '/delete',
              data : ajaxData,
              success : function(data) {
                  reloadCalendar();
              },
              beforeSend : function(xhr) {
                  showSpinner();
              },
              error : function(jqXHR, textStatus, errorThrown) {
                  hideSpinner();
                  alert(textStatus + ": " + errorThrown);
              }
          });
          $('.saveMeetingModal').dialog('close');
      });

      /*
      Author: shiju@qburst.com
      Description: create/update event
      */
      $('#save_meeting').click(function() {
          var date = window.moment($('#meeting_date').val(), long_date_format);
          var date_end = date.clone();
          if (date.isoWeekday() == 6 || date.isoWeekday() == 7) {
              jAlert(langWarningWeekend, langInfo);
              return false;
          }
          
          if (allow_multiple_days == 1) {
              date_end = window.moment($('#meeting_end_date').val(), long_date_format);
              if (date_end.isoWeekday() == 6 || date_end.isoWeekday() == 7) {
                  jAlert(langWarningWeekend, langInfo);
                  return false;
              }
          }
          
          var start_time = window.moment($('#start_time').val(), 'HH:mm');          
          date.hours(start_time.hours());
          date.minutes(start_time.minutes());
          
          var end_time = window.moment($('#end_time').val(), 'HH:mm');
          date_end.hours(end_time.hours());
          date_end.minutes(end_time.minutes());
          
          if (date_end.isBefore(date, 'minutes') || date_end.isSame(date, 'minutes')) {
              jAlert(langWarningUpdatePast, langInfo);
              return false;
          }       

          if ($('#subject').val() == '') {
              jAlert(langWarningFieldsMandatory, langInfo);
              return false;              
          }
          
          if (!validate()) {
              jAlert(langInvalidSubject, langInfo);
              return false;
          }
          
          if (isPastDay(date)) {
              jAlert(langWarningUpdatePast, langInfo);
              return false;
          }
          
          var periodtype = 0;
          var period = 0;
          if ($('#recurCheckbox').is(':checked')) {
              periodtype = parseInt($("#periodtype").val());
              period = parseInt($("#period").val());
          }
          
          if (isOverlapping($("#event_id").val(), $('#selected_meeting_room').val(), date, date_end, periodtype, period)) {
              jAlert(langRoomAlreadyBooked, langAlert);
              return false;
          }
          
          console.log('No overlapping');
          $('.saveMeetingModal').dialog('close');
          //setting the variable for update or create as required
          if ($('#event_id').val() == 0) {
              var action = 'create';
          } else {
              var action = 'update';
          }
          var customData = {};
          customData[fieldIdStart] = date.format('HH:mm');
          customData[fieldIdEnd] = date_end.format('HH:mm');
          customData[fieldIdRoom] = $('#selected_meeting_room').val();
          var category_id = 0;
          if (show_categories == '1')
            category_id = $('#category_id').val();
          var ajaxData = {
              key: api_key,
              project_id: $('#project_id').val(),
              author_id : $('#author_id').val(),
              assigned_to_id : $('#assigned_to_id').val(),
              category_id: category_id,
              subject : $('#subject').val(),
              start_date : date.format('YYYY-MM-DD'),
              due_date : date_end.format('YYYY-MM-DD'),
              custom_field_values : customData,
              event_id : $('#event_id').val(),
              recur : $('#recurCheckbox').is(':checked'),
              periodtype : $('#periodtype').val(),
              period : $('#period').val()
          };
          $.ajax({
              url : baseUrl + '/' + pluginName + '/' + action,
              data : ajaxData,
              success : function(data) {
                  reloadCalendar();
              },
              beforeSend : function(xhr) {
                  showSpinner();
              },
              error : function(jqXHR, textStatus, errorThrown) {
                  hideSpinner();
                  alert(textStatus + ": " + errorThrown);
              }
          });
          $('#event_id').val(0);
          $('#recur_meeting').val('');
      });

      /*
      Author: shiju@qburst.com
      Description: Save the meeting on stroke of ENTER button
      */
      $('.saveMeetingModal').keypress(function(e) {
          if (e.which == 13) {
              jQuery('#save_meeting').focus().click();
              e.preventDefault();
              return false;
          }
      });
      
      var localize = function() {          
          //localization
          window.moment.locale(current_lang);
          var weekdays_min = window.moment.weekdaysMin();
          var weekdays_short = window.moment.weekdaysShort();
          var weekdays = window.moment.weekdays();
          var months_short = window.moment.monthsShort();
          var months = window.moment.months();
          
          var locale_Data = window.moment.localeData();
          var first_day = locale_Data.firstDayOfWeek();
          long_date_format = locale_Data.longDateFormat('L');
          long_date_format_datepicker = long_date_format.toLocaleLowerCase();
          long_date_format_datepicker = long_date_format_datepicker.replace(/yy/g, 'y');
          long_time_format = locale_Data.longDateFormat('LT');
          
          $('#datepicker').datepicker({
              inline : false,
              firstDay : first_day,
              dateFormat : long_date_format_datepicker,
              minDate : 0, // past days disabled
              monthNamesShort : months_short,
              monthNames : months,
              dayNamesMin : weekdays_min,
              dayNamesShort : weekdays_short,
              dayNames : weekdays,              
              beforeShowDay: $.datepicker.noWeekends,
              onSelect : function(dateText, inst) {
                  $('#calendar').fullCalendar('changeView', 'agendaDay');
                  $('#calendar').fullCalendar('gotoDate', $('#datepicker').datepicker("getDate"));
              }
          });
          
          $('#meeting_date').datepicker({
              inline : false,
              firstDay : first_day,
              dateFormat : long_date_format_datepicker,
              minDate : 0, // past days disabled
              monthNamesShort : months_short,
              monthNames : months,
              dayNamesMin : weekdays_min,
              dayNamesShort : weekdays_short,
              dayNames : weekdays,
              
              beforeShowDay: $.datepicker.noWeekends
          });
          
          $('#meeting_end_date').datepicker({
              inline : false,
              firstDay : first_day,
              dateFormat : long_date_format_datepicker,
              minDate : 0, // past days disabled
              monthNamesShort : months_short,
              monthNames : months,
              dayNamesMin : weekdays_min,
              dayNamesShort : weekdays_short,
              dayNames : weekdays,
              beforeShowDay: $.datepicker.noWeekends
          });
          
          $('#start_time').empty();
          for (var i = 0; i < all_start_times.length; i++) {
              $('#start_time').append($('<option>', { 
                  value: all_start_times[i],
                  text : window.moment(all_start_times[i], 'HH:mm').format(long_time_format)
              }));
          }
          
          $('#end_time').empty();
          for (var i = 0; i < all_end_times.length; i++) {
              $('#end_time').append($('<option>', { 
                  value: all_end_times[i],
                  text : window.moment(all_end_times[i], 'HH:mm').format(long_time_format)
              }));
          }
          
          start_time_clone = $('#start_time option').clone();
          end_time_clone = $('#end_time option').clone();
      };

      loadCalendar();
      // intial load calendar
      
      localize();

  }); 